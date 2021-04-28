const packets = require('./packets');
const DataType = packets.DataType;

class Sender{
	static CreatePacket(packetId, args){
		// This function takes an array and turns it into a Buffer (bytes) as defined by packets.json
		var i = 0;
		var varLength = 0;
		var packet = packets.fields[packetId];
		var types = packet.types;
		
		// We need to know the size of the Buffer before initializing, so we calculate the size of all variable arguments here.
		for (type of types){
			if (type.variable){
				switch (type){
					case DataType.STRING:
						varLength += Buffer.byteLength(args[i]);
						break;
					case DataType.FILE:
						varLength += args[i].length;
						break;
				}
			}
			
			i++;
		}
		
		// Create the Buffer and write the PacketID to it.
		var buffer = Buffer.allocUnsafe(1 + packet.size + varLength);
		buffer.writeUInt8(packetId);
		var offset = 1;
		i = 0;
		
		// For every element in the array, write the corresponding data to the Buffer.
		for (var type of types){
			switch (type){
				case DataType.UINT:
					buffer.writeUInt32LE(args[i], offset);
					break;
				case DataType.INT:
					buffer.writeInt32LE(args[i], offset);
					break;
				case DataType.UBYTE:
					buffer.writeUInt8(args[i], offset);
					break;
				case DataType.BYTE:
					buffer.writeInt8(args[i], offset);
					break;
				case DataType.STRING:
					var string_length = buffer.write(args[i], offset + 2);
					buffer.writeUInt16LE(string_length, offset);
					offset += string_length;
					break;
				case DataType.FILE:
					buffer.writeUInt32LE(args[i].length, offset);
					args[i].copy(buffer, offset + 4);
					offset += buffer.length;
					break;
			}
			offset += type.size;
			i++;
		}
		
		return buffer;
	}
}

module.exports = Sender;