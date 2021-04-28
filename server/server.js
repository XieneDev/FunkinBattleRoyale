const fs = require('fs');
const net = require('net');
const custom_console = require('./custom_console');
const log = custom_console.log;

const Receiver = require('./receiver');
const Sender = require('./sender');
const tokens = require('./tokens');
const packets = require('./packets');

const settings = JSON.parse(fs.readFileSync('settings.json'));


const server = net.createServer();


players = {} // Holds sockets that have gotten to the lobby
id = 0; // Increasing number that is used to assing IDs to players.

const STATES = {
	'LOBBY': 0,
	'PREPARING': 1,
	'PLAYING': 2,
};
state = STATES.LOBBY;

in_game_count = 0;


song = "";
folder = "";

voices_packet = null;
inst_packet = null;
chart_packet = null;


function create_player(socket, nickname){
	var player = {
		'socket': socket,
		'id': id,
		'nickname': nickname,
		'ready': false,
		'alive': true,
	};
	socket.player = player;
	players[id] = player;
	id++;
	
	player.broadcast = function(buffer){
		// Send message to all players but this one.
		for (let p of Object.values(players)){
			if (p.id != player.id){
				p.socket.write(buffer);
			}
		}
	}
	
	return player;
}

function broadcast(buffer){
	// Send message to all players.
	for (let p of Object.values(players)){
		p.socket.write(buffer);
	}
}

// Keep-Alive packets
setInterval(function(){
	for (let p of Object.values(players)){
		// Loading the songs can take a while, and the client can't respond to keep-alives during that time.
		if (state == STATES.PREPARING && !p.ready)
			continue;
		// If the player hasn't responded to the keep-alive, destroy the connection.
		if (!p.alive)
			p.socket.destroy();
		p.alive = false;
	}
	// Send a new keep-alive packet
	broadcast(Sender.CreatePacket(packets.KEEP_ALIVE, []));
}, settings.keep_alive);

server.on('connection', function (socket) {
	var receiver = new Receiver(socket);
	
	
	receiver.on('data', function (packetId, data) {
		var socket = receiver.socket;
		var player = socket.player;
		
		switch (packetId){
			// Setup
			case packets.SEND_CLIENT_TOKEN:
				var token = data[0];
				if (token == tokens.clientToken){ // Client's & server's tokens match
					socket.write(Sender.CreatePacket(packets.SEND_SERVER_TOKEN, [tokens.serverToken]));
					socket.verified = true;
				}else // Client's & server's tokens don't match
					socket.destroy()
				break;
			case packets.SEND_PASSWORD:
				var pwd = data[0];
				if (socket.verified && pwd == settings.password){
					if (state != STATES.LOBBY){
						socket.write(Sender.CreatePacket(packets.PASSWORD_CONFIRM, [1])); // Game already in progress
						socket.destroy();
						break;
					}
					// Authorized
					socket.authorized = true;
					socket.write(Sender.CreatePacket(packets.PASSWORD_CONFIRM, [0]));
				}else{
					socket.write(Sender.CreatePacket(packets.PASSWORD_CONFIRM, [2])); // Wrong password
					socket.destroy();
				}
				break;
			
			// Nickname / Lobby
			case packets.SEND_NICKNAME:
				if (socket.authorized){
					var nick = data[0];
					
					
					if (nick == '' || /[^A-Za-z0-9.-]/.test(nick) || nick.length > 12){
						socket.write(Sender.CreatePacket(packets.NICKNAME_CONFIRM, [3])); // Invalid nickname
						break;
					}
					
					for (p of Object.values(players)){
						if (p.nickname == nick){
							socket.write(Sender.CreatePacket(packets.NICKNAME_CONFIRM, [1])); // Nickname already claimed
							return;
						}
					}
					
					if (state != STATES.LOBBY){
						socket.write(Sender.CreatePacket(packets.NICKNAME_CONFIRM, [2])); // Game already in progress
						break;
					}
					
					// Nickname accepted
					socket.nickname = nick;
					socket.write(Sender.CreatePacket(packets.NICKNAME_CONFIRM, [0]));
					break;
				}
				break;
			case packets.KEEP_ALIVE: // KEEP_ALIVE packet can be sent by server and client
				if (player)
					player.alive = true;
				break;
			case packets.JOINED_LOBBY:
				if (socket.nickname){
					// Create player object for this player
					player = create_player(socket, socket.nickname);
					delete socket['nickname'];
					
					// Tell all players that this new player joined.
					player.broadcast(Sender.CreatePacket(packets.BROADCAST_NEW_PLAYER, [player.id, player.nickname]));
					// Tell this new player all the players that are already joined.
					for (let p of Object.values(players)){
						if (p.id != player.id){
							socket.write(Sender.CreatePacket(packets.BROADCAST_NEW_PLAYER, [p.id, p.nickname]));
						}
					}
					
					// This is used so that the player knows when the previous players are done being sent, and it knows it's own position in the list.
					socket.write(Sender.CreatePacket(packets.END_PREV_PLAYERS, []));
				}
				break;
			
			// Gaming
			case packets.GAME_READY:
				if (player && !player.ready && state == STATES.PREPARING){
					player.ready = true;
					in_game_count++;
					
					// Tell everyone how many players are ready, for the "Waiting for players..." screen.
					broadcast(Sender.CreatePacket(packets.PLAYERS_READY, [in_game_count]));
					
					if (in_game_count == Object.keys(players).length){
						// When all players are ready
						start_game();
					}else if (in_game_count == 1){
						
						setTimeout(function() {
							// This code is dangerously close to terrible.
							// In practice, it's unlikely to cause issues.
							if (state == STATES.PREPARING){
								dead_ids = [];
								for (let p of Object.values(players)){
									if (!p.ready)
										dead_ids.push(p.id);
								}
								for (dead_id of dead_ids){
									players[dead_id].socket.destroy();
								}
								
								start_game();
							}
						}, settings.wait);
						
					}
				}
				break;
			case packets.SEND_SCORE:
				if (player && state == STATES.PLAYING){
					var score = data[0];
					// Broadcast score. Yeah, there's no server-side verification, too lazy to implement it... :/
					player.broadcast(Sender.CreatePacket(packets.BROADCAST_SCORE, [player.id, score]));
				}
				break;
			case packets.GAME_END:
				if (player && player.ready && state == STATES.PLAYING){
					in_game_count--;
					player.ready = false;
					if (in_game_count == 0){
						end_game();
					}
				}
				break;
			
			// Chat
			case packets.SEND_CHAT_MESSAGE:
				if (player){
					var message = data[0];
					
					player.broadcast(Sender.CreatePacket(packets.BROADCAST_CHAT_MESSAGE, [player.id, message]));
				}
				break;
			
			// Download
			case packets.READY_DOWNLOAD:
				if (player && state == STATES.PREPARING)
					socket.write(chart_packet);
				break;
			case packets.REQUEST_VOICES:
				if (player && state == STATES.PREPARING){
					if (voices_packet)
						socket.write(voices_packet);
					else{
						socket.write(Sender.CreatePacket(packets.DENY, []));
						// Give the client time to see the DENY packet
						setTimeout(function() {socket.destroy();}, 1000);
					}
				}
				break;
			case packets.REQUEST_INST:
				if (player && state == STATES.PREPARING){
					if (inst_packet)
						socket.write(inst_packet);
					else{
						socket.write(Sender.CreatePacket(packets.DENY, []));
						// Give the client time to see the DENY packet
						setTimeout(function() {socket.destroy();}, 1000);
					}
				}
				break;
			
			// Error
			default:
				log("Wrong Packet ID from client " + player.id);
				socket.destroy();
				break;
		}
	});
	
	
	function client_leave(){
		var player = socket.player;
		
		if (player){
			// Tell other players that this player just left.
			player.broadcast(Sender.CreatePacket(packets.PLAYER_LEFT, [player.id]));
			
			// If the only player that's yet to be ready leaves the server, start the game (or end it if this was the only player at all).
			if (in_game_count == Object.keys(players).length - 1 && !player.ready && state == STATES.PREPARING){
				if (in_game_count > 0)
					start_game();
				else
					end_game();
			}
			
			if (player.ready){
				in_game_count--;
				
				if (state == STATES.PLAYING){
					// If the last player leaves, end the game.
					if (in_game_count == 0){
						end_game();
					}
				}
			}
			
			// Remove the player object.
			delete players[player.id];
			
			broadcast(Sender.CreatePacket(packets.PLAYERS_READY, [in_game_count]));
		}
	}
	
	
	socket.on('error', function(e) {
		client_leave();
		socket.destroy();
	});
	
	
	socket.on('end', function () {
		client_leave();
	});
});

function start_game(){
	state = STATES.PLAYING;
	broadcast(Sender.CreatePacket(packets.EVERYONE_READY, [settings.safe_frames]));
}

function end_game(){
	state = STATES.LOBBY;
	for (p of Object.values(players)){
		p.ready = false;
	}
	in_game_count = 0;
	log("Game finished");
}


server.on('listening', function () {
	log("Server started on port " + PORT);
});


server.maxConnections = 256;

const PORT = process.env.PORT || settings.port;
server.listen(PORT);



// Console commands stuff below
// I would have loved to include this in a different file but I couldn't find an elegant approach
// Globals vars are not elegant

const commands = {
	"start": "Start the game",
	"setsong": "Set the song to be played - takes folder and filename as arguments",
	"count": "Count the number of players online, and number or players that are ready",
	"list": "Display a list of IDs and player names",
	
	"exit": "Close the server",
};


custom_console.handle = function (input){
	var separated = input.split(" ");
	var command = separated[0]
	var args = separated.slice(1);
	
	if (command == "help"){
		var help_string = "";
		for (const [cmd, desc] of Object.entries(commands)){
			help_string += cmd + ": " + desc + "\n";
		}
		help_string = help_string.substr(0, help_string.length - 1);
		log(help_string);
		return;
	}
	
	if (command in commands){
		switch (command){
			case "start":
				if (state == STATES.LOBBY){
					if (!fs.existsSync(`data/${folder}/${song}.json`)){
						log("Invalid song");
						return;
					}
					
					if (Object.keys(players).length == 0){
						log("No players joined");
						return;
					}
					
					log("Starting game");
					
					// Load the chart from file
					chart = fs.readFileSync('data/' + folder + '/' + song + '.json');
					let i = chart.length - 1;
					while (chart.readUInt8(i) != 125){
						i--;
						// "LOL GOING THROUGH THE BULLSHIT TO CLEAN IDK WHATS STRANGE" - ninjamuffin99
					}
					chart = chart.slice(0, i + 1);

					var song_name = JSON.parse(chart).song.song.toLowerCase();
					
					chart_packet = Sender.CreatePacket(packets.SEND_CHART, [chart]);
					
					var voices_path = 'songs/' + song_name + '/Voices.ogg';
					var inst_path = 'songs/' + song_name + '/Inst.ogg'
					
					// Load the voices & inst from file
					// If they don't exists, a DENY packet will be sent when a player requests them
					voices_packet = null;
					if (fs.existsSync(voices_path))
						voices_packet = Sender.CreatePacket(packets.SEND_VOICES, [fs.readFileSync(voices_path)]);
					inst_packet = null;
					if (fs.existsSync(inst_path))
						inst_packet = Sender.CreatePacket(packets.SEND_INST, [fs.readFileSync(inst_path)]);
					
					// Tell all players that the game is starting
					broadcast(Sender.CreatePacket(packets.GAME_START, [song, folder]));
					state = STATES.PREPARING;
				}else{
					log("Game already in progress");
				}
				break;
			case "setsong":
				if (args.length < 2) {log("2 arguments expected: song, folder"); break;}
				if (!fs.existsSync(`data/${args[1]}/${args[0]}.json`)) {log(`Couldn't find 'data/${args[1]}/${args[0]}.json'`); break;}
				song = args[0];
				folder = args[1];
				log(`Set song to ${folder}/${song}`);
				break;
			case "count":
				log("Players: " + Object.keys(players).length + "\nReady Count: " + in_game_count);
				break;
			case "list":
				var output = "";
				for (p of Object.values(players)){
					output += p.id + ": " + p.nickname + "\n";
				}
				log(output);
				break;
			/*case "endsong":
				if (state == STATES.PLAYING || state == STATES.PREPARING){
					broadcast(Sender.CreatePacket(packets.FORCE_GAME_END, []));
					end_game();
				}else{
					log("No game in progress");
				}
				break;*/
			case "exit":
				process.exit(1);
				break;
		}
	}else{
		log("Couldn't recognize command '" + command + "'. Try using 'help'.");
	}
}