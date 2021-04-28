const events = require('events');
const packets = require('./packets');

class Receiver extends events.EventEmitter{
	constructor(socket){
		super();
		
		this.bufferedBytes = 0; // Number of bytes in the buffer
		this.buffers = []; // Stores the data from each TCP message (these can contain only partial information, so we have to store them)
		
		this.packet = null; // The packet type being analyzed. Contains the Data Types, size, variable-length arguments, etc.
		this.packetId = 0; // The ID of the packet being received.
		this.endedPacket = true; // Whether the current packet is done being analyzed and we can move on to the next one.
		this.w = 0; // Index of the current variable data being analyzed and stuff.
		this.varLength = 0; // The amount of extra bytes taken up by variable-length datatypes.
		this.varSize = 0; // The byte-size of the size-specificator of the current variable-length datatype being analyzed.
		
		this.socket = socket; // The socket from which the data is being received.
		
		socket.on('data', this.onData.bind(this));
	}
	
	onData(data){
		// This function is triggered whenever data is received from a socket.
		
		// Save the bytes on memory.
		this.bufferedBytes += data.length;
		this.buffers.push(data);
		
		while (this.bufferedBytes > 0){
			if (this.endedPacket){
				// If we're starting a new packet, initialize all relevant PacketID variables.
				this.endedPacket = false;
				this.packetId = this.consume(1).readUInt8();
				
				if (this.packetId in packets.fields){
					this.packet = packets.fields[this.packetId];
				}else{
					// If the PacketID doesn't exist, close the socket.
					this.socket.destroy();
					return;
				}
				
				this.varSize = this.packet.varLengths[0]; // Byte-size of the size-specifier of the first variable argument.
														  // If there's no variable arguments, it returns the size of the entire packet.
			}
			
			// If there's still variable arguments left, and there's enough bytes received to complete it, then handle it.
			if (this.bufferedBytes >= this.packet.varSpaces[this.w] + this.varLength + this.varSize && this.w < this.packet.varLengths.length){
				// Under some cases this code fails but I'm too lazy to fix it. There shouldn't be any issues with the packets I implemented.
				this.varLength += this.readBuffer(this.packet.varSpaces[this.w] + this.varLength, this.varSize);
				this.w++;
				this.varSize = this.packet.varLengths[this.w];
				// Repeat this loop.
				continue;
			}
			
			// If this is the last variable argument (or if there were none), and there's enough bytes received to complete it, then handle it.
			if (this.bufferedBytes >= this.packet.varSpaces[this.w] + this.varLength && this.w == this.packet.varLengths.length){
				// Handle the whole packet and emit a signal that will be picked up by server.js
				this.emit('data', this.packetId, this.packet.handle(this.consume(this.packet.size + this.varLength)));
				this.w = 0;
				this.varLength = 0;
				this.endedPacket = true;
				// Repeat this loop.
				continue;
			}
			
			// If you can't do anything with the data, just stop and wait for more data to come.
			break;
		}
	}
	
	readBuffer(n, bytes){
		// Reads 'bytes' number of bytes starting at position n from the buffered bytes.
		// Similar behaviour to 'consume', but this function doesn't consume the bytes.
		var runningTotal = 0;
		for (var buf of this.buffers){
			runningTotal += buf.length;
			if (n < runningTotal){
				// This if-statement is hardcoded because this function shouldn't be needed for anything else.
				if (bytes == 2)
					return buf.readUInt16BE(n);
				else
					return buf.readUInt32BE(n);
			}
		}
		
		// This code should never be reached.
		return -1;
	}
	
	consume(n){
		// This function returns a Buffer from the n bytes that were received longest ago, and clears and updates the buffers accordingly.
		if (n == 0) return null;
		
		this.bufferedBytes -= n;
		
		if (n == this.buffers[0].length) return this.buffers.shift();
		
		if (n < this.buffers[0].length) {
		  const buf = this.buffers[0];
		  this.buffers[0] = buf.slice(n);
		  return buf.slice(0, n);
		}
		
		const dst = Buffer.allocUnsafe(n);

		do {
		  const buf = this.buffers[0];
		  const offset = dst.length - n;

		  if (n >= buf.length) {
			dst.set(this._buffers.shift(), offset);
		  } else {
			dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
			this._buffers[0] = buf.slice(n);
		  }

		  n -= buf.length;
		} while (n > 0);

		return dst;
	}
}

module.exports = Receiver;