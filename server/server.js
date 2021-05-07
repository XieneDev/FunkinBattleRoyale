const fs = require('fs');
const net = require('net');
const custom_console = require('./custom_console');
const log = custom_console.log;

const Receiver = require('./receiver');
const Sender = require('./sender');
const tokens = require('./tokens');
const packets = require('./packets');

var settings = JSON.parse(fs.readFileSync('settings.json'));
var banlist = JSON.parse(fs.readFileSync('banlist.json'));
var mutelist = JSON.parse(fs.readFileSync('mutelist.json'));


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
		'last_chat': 0,
		'muted': mutelist.includes(socket.remoteAddress),
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
	
	player.destroy = function(destroy_socket=true){
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
		
		// Delete the socket
		if (player.socket && destroy_socket){
			player.socket.end(Sender.CreatePacket(packets.DISCONNECT, []), () => {player.socket.destroy()});
		}
			
		// Remove the player object.
		delete players[player.id];
		
		if (state == STATES.PREPARING)
			broadcast(Sender.CreatePacket(packets.PLAYERS_READY, [in_game_count]));
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
function keep_alive(){
	for (let p of Object.values(players)){
		// Loading the songs can take a while, and the client can't respond to keep-alives during that time.
		if (state == STATES.PREPARING && !p.ready)
			continue;
		// If the player hasn't responded to the keep-alive, destroy the connection.
		if (!p.alive)
			p.destroy();
		else
			p.alive = false;
	}
	// Send a new keep-alive packet
	broadcast(Sender.CreatePacket(packets.KEEP_ALIVE, []));
	
	setTimeout(keep_alive, settings.keep_alive);
}
keep_alive();

server.on('connection', function (socket) {
	if (banlist.includes(socket.remoteAddress))
		socket.destroy();
	
	
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
					if (Object.keys(players).length >= settings.max_players){
						socket.write(Sender.CreatePacket(packets.PASSWORD_CONFIRM, [3])); // Game already full
						socket.destroy();
						break;
					}else if (state != STATES.LOBBY){
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
					
					if (Object.keys(players).length >= settings.max_players){
						socket.write(Sender.CreatePacket(packets.NICKNAME_CONFIRM, [4])); // Game already full
						socket.destroy();
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
								for (let p of Object.values(players)){
									if (!p.ready)
										p.destroy();
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
					var id = data[0];
					var message = data[1];
					
					if (player.muted){
						player.socket.write(Sender.CreatePacket(packets.MUTED, []));
						return;
					}
					
					if (message.length > 0 && message[0] != ' ' && message.length <= 80){
						if (Date.now() - player.last_chat > settings.chat_speed){
							player.broadcast(Sender.CreatePacket(packets.BROADCAST_CHAT_MESSAGE, [player.id, message]));
							player.last_chat = Date.now();
							return;
						}
					}
					
					// Reject the message
					player.socket.write(Sender.CreatePacket(packets.REJECT_CHAT_MESSAAGE, [id]));
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
						setTimeout(function() {player.destroy();}, 1000);
					}
				}
				break;
			case packets.REQUEST_INST:
				if (player && state == STATES.PREPARING){
					log("Request Inst");
					if (inst_packet){
						log("Writing Inst");
						socket.write(inst_packet);
					}else{
						socket.write(Sender.CreatePacket(packets.DENY, []));
						// Give the client time to see the DENY packet
						setTimeout(function() {player.destroy();}, 1000);
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
		
		if (player && player.id in players){
			player.destroy(false);
		}
	}
	
	
	socket.on('error', function(e) {
		client_leave();
		socket.destroy();
	});
	
	
	socket.on('end', function () {
		client_leave();
	});
	
	socket.on('close', function() {
		client_leave();
	});
});

function start_game(){
	if (state == STATES.PREPARING){
		state = STATES.PLAYING;
		broadcast(Sender.CreatePacket(packets.EVERYONE_READY, [settings.safe_frames]));
	}
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
	
	"force_start": "Forces the game to start. Any player that isn't ready will be disconnected from the server",
	"force_end": "Forces the game to end. All players will be sent back to the lobby",
	
	"kick": "Kick a player from the game",
	"ban": "Ban a player from the game",
	"mute": "Prevent a player from talking",
	"unmute": "Let a player talk again",
	
	"say": "Say something in the chat",
	
	"reload": "Reloads the settings file",
	
	"cls": "Clears the console",
	
	"exit": "Close the server"
};


custom_console.handle = function (input){
	var separated = input.split(" ");
	var command = separated[0]
	var args = separated.slice(1);
	
	if (command == '') return;
	
	if (command == "help"){
		var help_string = "";
		for (const [cmd, desc] of Object.entries(commands)){
			help_string += cmd + ": " + desc + "\n";
		}
		log(help_string.substr(0, help_string.length - 1));
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

					let song_name = JSON.parse(chart).song.song.toLowerCase();
					
					chart_packet = Sender.CreatePacket(packets.SEND_CHART, [chart]);
					
					let voices_path = 'data/' + folder + '/Voices.ogg';
					let voices_path2 = 'songs/' + song_name + '/Voices.ogg';
					let inst_path = 'data/' + folder + '/Inst.ogg';
					let inst_path2 = 'songs/' + song_name + '/Inst.ogg'
					
					// Load the voices & inst from file
					// If they don't exists, a DENY packet will be sent when a player requests them
					voices_packet = null;
					if (fs.existsSync(voices_path))
						voices_packet = Sender.CreatePacket(packets.SEND_VOICES, [fs.readFileSync(voices_path)]);
					else if (fs.existsSync(voices_path2))
						voices_packet = Sender.CreatePacket(packets.SEND_VOICES, [fs.readFileSync(voices_path2)]);
					
					inst_packet = null;
					if (fs.existsSync(inst_path))
						inst_packet = Sender.CreatePacket(packets.SEND_INST, [fs.readFileSync(inst_path)]);
					else if (fs.existsSync(inst_path2))
						inst_packet = Sender.CreatePacket(packets.SEND_INST, [fs.readFileSync(inst_path2)]);
					
					// Tell all players that the game is starting
					broadcast(Sender.CreatePacket(packets.GAME_START, [song, folder]));
					state = STATES.PREPARING;
				}else{
					log("Game already in progress");
				}
				break;
			case "setsong":
				if (args.length < 2) {log("Expected 2 arguments: file, folder"); break;}
				if (!fs.existsSync(`data/${args[1]}/${args[0]}.json`)) {log(`Couldn't find 'data/${args[1]}/${args[0]}.json'`); break;}
				song = args[0];
				folder = args[1];
				
				let audio = fs.existsSync(`data/${folder}/Voices.ogg`) || fs.existsSync(`data/${folder}/Inst.ogg`);
				
				log("Set song to " + folder + "/" + song + ". " + (audio ? ("Found audio files at data/" + folder) : ("Did not find audio files at data/" + folder)) + ".");
				break;
			case "count":
				log("Players: " + Object.keys(players).length + "\nReady Count: " + in_game_count);
				break;
			case "list":
				if (Object.keys(players).length == 0) {log("No players"); break;}
				var output = "";
				for (p of Object.values(players)){
					output += p.id + ": " + p.nickname + "\n";
				}
				log(output.substr(0, output.length - 1));
				break;
			
			case "force_start":
				if (state == STATES.PREPARING){
					for (let p of Object.values(players)){
						if (!p.ready)
							p.destroy()
					}
					
					// start_game();
					log("Forcing start");
				}else if (state == STATES.LOBBY){
					log("No game in progress");
				}else if (state == STATES.PLAYING){
					log("Game already in progress");
				}
				break;
			case "force_end":
				if (state == STATES.PLAYING || state == STATES.PREPARING){
					broadcast(Sender.CreatePacket(packets.FORCE_GAME_END, []));
					end_game();
				}else{
					log("No game in progress");
				}
				break;
			
			case "kick":
				if (args.length < 1) {log("Expected 1 argument: nickname"); break;};
				
				for (let p of Object.values(players)){
					if (p.nickname == args[0]){
						log("Kicked '" + p.nickname + "' from the game");
						p.destroy();
						return;
					}
				}
				
				log("Couldn't find player '" + args[0] + "'");
				
				break;
			case "ban":
				if (args.length < 1) {log("Expected 1 argument: nickname"); break;};
				for (let p of Object.values(players)){
					if (p.nickname == args[0]){
						log("Banned '" + p.nickname + "' from the game");
						
						// Add them to the ban list
						let ip = p.socket.remoteAddress;
						banlist.push(ip);
						fs.writeFile('banlist.json', JSON.stringify(banlist), (err) => {});
						
						p.destroy();
						return;
					}
				}
				
				log("Couldn't find player '" + args[0] + "'");
				
				break;
			case "mute":
				if (args.length < 1) {log("Expected 1 argument: nickname"); break;};
				for (let p of Object.values(players)){
					if (p.nickname == args[0]){
						log("Muted '" + p.nickname + "'");
						
						// Add them to the mute list
						let ip = p.socket.remoteAddress;
						mutelist.push(ip);
						fs.writeFile('mutelist.json', JSON.stringify(mutelist), (err) => {});
						
						p.muted = true;
						
						return;
					}
				}
				
				log("Couldn't find player '" + args[0] + "'");
				
				break;
			case "unmute":
				if (args.length < 1) {log("Expected 1 argument: nickname"); break;};
				for (let p of Object.values(players)){
					if (p.nickname == args[0]){
						
						// Remove them from the mute list
						let ip = p.socket.remoteAddress;
						let index = mutelist.indexOf(ip);
						if (index > -1){
							mutelist.splice(index, 1);
							fs.writeFile('mutelist.json', JSON.stringify(mutelist), (err) => {});
							p.muted = false;
							
							log("Unmuted '" + p.nickname + "'");
							return;
						}
						
						log("'" + p.nickname + "' isn't muted");
						return;
					}
				}
				
				log("Couldn't find player '" + args[0] + "'");
				
				break;
			
			case "say":
				if (args.length < 1) {log("Expected 1 argument: message"); break;};
				var message = input.substr(command.length + 1);
				broadcast(Sender.CreatePacket(packets.SERVER_CHAT_MESSAGE, [message]));
				log("Sent message");
				break;
			
			case "reload":
				fs.readFile('settings.json', (err, data) => {
					settings = JSON.parse(data);
					log("Reloaded settings");
				});
				fs.readFile('banlist.json', (err, data) => {
					banlist = JSON.parse(data);
					log("Reloaded banlist");
				});
				fs.readFile('mutelist.json', (err, data) => {
					mutelist = JSON.parse(data);
					log("Reloaded mutelist");
					
					for (p of Object.values(players)){
						p.muted = mutelist.includes(p.socket.remoteAddress);
					}
				});
				break;
			
			case "cls":
				custom_console.body.setContent("");
				break;
			
			case "exit":
				process.exit(1);
				break;
		}
	}else{
		log("Couldn't recognize command '" + command + "'. Try using 'help'");
	}
}