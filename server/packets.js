const fs = require('fs');

packets = {};
fields = {};
DataType = {};


class Packet{
	constructor(types){
		this.types = types;
		this.size = 0; // The minimum size of the entire packet in bytes (minimum cuz variable length arguments exist). 
		this.varLengths = []; // Holds byte-sizes of each variable length size specifier. e.g. STRING is 2, FILE is 4.
		this.varSpaces = []; // Holds the number of constant-argument bytes in between variable length arguments. The sum of all elements will equal this.size
							// *It includes the byte-size of the size specificator of the last variable argument, and also a trailing element.
							// e.g. a packet with args [INT, STRING, BYTE, FILE] will have this variable as [4, 3, 4].
							// idk it's kinda hard to explain.
		
		var lastVar = 0;
		
		// Calculate this.size, this.varLengths, and this.varSpaces according to the packet types.
		for (var type of types){
			if (type.variable){
				this.varLengths.push(type.size);
				
				this.varSpaces.push(this.size - lastVar);
				lastVar = this.size - lastVar;
			}
			
			this.size += type.size;
		}
		this.varSpaces.push(this.size - lastVar);
	}
	
	handle(buf){
		// This function transforms a Buffer (bytes) into an array with the appropiate arguments, as defined in packets.json
		var args = [];
		var offset = 0;
		
		for (var type of this.types){
			switch (type){
				case DataType.UINT:
					args.push(buf.readUInt32BE(offset));
					break;
				case DataType.INT:
					args.push(buf.readInt32BE(offset));
					break;
				case DataType.UBYTE:
					args.push(buf.readUInt8(offset));
					break;
				case DataType.BYTE:
					args.push(buf.readInt8(offset));
					break;
				case DataType.STRING:
					var string_length = buf.readUInt16BE(offset);
					args.push(buf.toString('utf8', offset + 2, offset + 2 + string_length));
					offset += string_length;
					break;
				case DataType.FILE:
					// The server should never receive a file, so this is left unimplemented.
					break;
			}
			
			offset += type.size;
		}
		
		return args;
	}
}


// Read JSON data
let packets_raw = fs.readFileSync('packets.json');
let data = JSON.parse(packets_raw);

// Process JSON data
let i = 0;
for (let datatype of data.datatypes){
	DataType[data.datatypes[i].id] = {"size": data.datatypes[i].size, "variable": data.datatypes[i].variable};
	i++;
}

i = 0;
for (let packet of data.packets){
	packets[packet.id] = i;
	var args = packet.args;
	args = args.map(e => {return DataType[e]});
	fields[i] = new Packet(args);
	i++;
}

delete i;


packets.fields = fields;
packets.DataType = DataType;

module.exports = packets;