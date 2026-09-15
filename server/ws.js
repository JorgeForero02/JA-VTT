'use strict';
/* Servidor WebSocket mínimo (RFC 6455) para no depender de paquetes externos.
   Soporta mensajes de texto, fragmentación, ping/pong y cierre. */
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 8 * 1024 * 1024;

class Socket extends EventEmitter {
  constructor(sock) {
    super();
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.parts = [];
    this.partsLen = 0;
    this.open = true;
    this.alive = true;
    sock.setNoDelay(true);
    sock.on('data', (d) => this._onData(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }

  _onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big); off = 10;
      }
      if (!masked) return this.close(1002); // los clientes siempre enmascaran
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);

      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this._send(0xA, data); continue; }
      if (opcode === 0xA) { this.alive = true; continue; }
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        this.parts.push(data);
        this.partsLen += data.length;
        if (this.partsLen > MAX_MESSAGE) return this.close(1009);
        if (fin) {
          const msg = Buffer.concat(this.parts).toString('utf8');
          this.parts = []; this.partsLen = 0;
          this.emit('message', msg);
        }
      }
    }
  }

  _send(opcode, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | opcode;
    try { this.sock.write(Buffer.concat([head, payload])); } catch { this._closed(); }
  }

  send(obj) {
    this._send(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8'));
  }

  ping() {
    this.alive = false;
    this._send(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code, 0);
    this._send(0x8, b);
    this.open = false;
    try { this.sock.end(); } catch {}
    this.emit('close');
  }
}

function acceptUpgrade(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  return new Socket(sock);
}

module.exports = { acceptUpgrade };
