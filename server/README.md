# Server

The server is built with [Node.js](https://nodejs.org), and uses [blessed](https://github.com/chjj/blessed) as a dependency.

For other people to play with you, you'll need to set up **Port Forwarding** or use a service like [Hamachi](https://www.vpn.net/) or [ngrok](https://ngrok.com/).

If you still have questions after reading this entire page, you can DM me on Discord @XieneDev#7006. I will not answer questions about how to port forward, set up Hamachi or use ngrok.

[Here's a video tutorial on how to set up a server!](https://youtu.be/ZY282kmjR68) The video was made for v1.0.0, but the process is largely the same. For more details on how it's different, continue reading this page.

# How to run it

1. Install [Node.js](https://nodejs.org). You'll need [npm](https://www.npmjs.com/), but that usually comes packaged with the Node.js installer.
2. Download the `server.zip` file from the [latest release](https://github.com/XieneDev/FunkinBattleRoyale/releases), and unpack it into its own folder. **\*this folder should be separate from the game files\***.
3. Open a console on the server folder, and run the command `npm install`.
4. Change the `settings.json` file to your preference. More details on that [down below](#Options).
5. Once that's done, run `node server`.

You should now see a console that looks something like this:

![](https://cdn.discordapp.com/attachments/834499801848217685/836345890653732914/console.PNG)

Now you can start adding songs.

# Adding songs

### Adding vanilla songs

If you want to add a song that's included in the normal game (that's weeks 1-6 as of now), create a folder called `data` in the server folder. Inside it, copy the folder you'd find in `assets/data` for the song you want to play. An example of how it should look like is `serverfolder/data/bopeebo/bopeebo-hard.json`.

### Adding custom songs

Firstly, repeat the same process that was done for vanilla songs, but for your custom chart.

Now simply drop in the `Voices.ogg` and `Inst.ogg` files for the song on that same folder (`serverfolder/data/songname`).

Secondly, create a `songs` folder inside your server folder, and copy the folder you'd find in `assets/songs` for the song you want to play. In the case of ballistic for example, you should have `serverfolder/data/ballistic/ballistic-hard.json`, `serverfolder/songs/ballistic/Voices.ogg` and `serverfolder/songs/ballistic/Inst.ogg`.

**IF YOU ARE USING A SONG THAT REPLACES THE VANILLA FILES, READ THIS:**

In the case of mods like the [B-Side Remixes](https://gamebanana.com/mods/42724) which are supposed to replace the vanilla files of the game, you'll need to change them.

Open the chart file you want to play, and search for an attribute called "song" that's followed by a name, like this: `"song":"pico"`. Change it to a unique name, for example: `"song":"bsides_pico"`.

### Selecting a song

Run the command `setsong 'file' 'folder'`. Replace `'file'` with the filename of the chart (excluding the .json) and replace `'folder'` with the name of the folder containing the chart file.

For example, if you want to play spookeez on easy mode, run `setsong spookeez-easy spookeez`. That is because spookeez should be contained in `serverfolder/data/spookeez/spookeez-easy.json`.

Another example: if you want to play ballistic on hard mode, run `setsong ballistic-hard ballistic`. That is because the chart should be contained in `serverfolder/data/ballistic/ballistic-hard.json`.

# Commands

- **help**: displays a list of all commands, with a short description of what they do.
- **count**: Tells you how many players are connected to the server.
- **list**: Tells you the names and IDs of the players connected to the server.
- **start**: Starts the game, according to the song that was set using `setsong`.
- **setsong**: Sets the song to be played. Takes 2 arguments: **folder** and **file**. This will look for a chart in `data/'folder'/'file'.json`. If it doesn't find a file there, the command will fail.
- **force_start**: Starts the game with the players that have loaded in. Any player that hasn't loaded yet will be kicked.
- **force_end**: Ends the game immediately, without waiting for the end of the song.
- **kick**: Removes a player from the game. Takes 1 argument: the **nickname** of the player you want to kick.
- **ban**: Kicks a player from the game and prevents them from joining again. It stores the ip of the player to acheive this. Takes 1 argument: the **nickname** of the player you want to ban.
- **mute**: Prevents a player from talking, and they also won't be able to talk in the future. It stores the ip of the player to acheive this. Takes 1 argument: the **nickname** of the player you want to mute.
- **unmute**: Lets a player talk again. Takes 1 argument: the **nickname** of the player you want to unmute.
- **say**: Outputs a chat message that all players can see. Takes 1 argument: the **message** you want to say.
- **reload**: Reloads `settings.json`, `banlist.json`, and `mutelist.json` without need of restarting the server.
- **cls**: Clears the console.
- **exit**: Closes the server.

# Options

There's a **settings.json** file in which you can change some options:

- **port**: the port on which the server will be open. Has to be a number between 1 and 65,535.
- **password**: The password that players will have to insert to join the server. Default: 'admin'.
- **keep_alive**: How often to send keep alive packets to the players, in milliseconds. Unless you know what you are doing, don't touch this setting. Default: 10 seconds.
- **wait**: How long to wait for players to be ready, in milliseconds. After the first player is ready to start playing, the server will wait this amount of time, and if everyone still isn't ready, everyone that's not ready will be kicked from the server and the match will start. Default: 3 minutes.
- **chat_speed**: How fast players can send chat messages, in milliseconds. If a player sends messages faster than this, those messages will be blocked and won't reach other players. Default: 1 second.
- **safe_frames**: A Kade Engine setting, controls how early/late you can hit a note. Default: 10.
- **max_players**: The maximum amount of players that can join the game. Default: 24.

# Controlling the console

The console is focused on the text input by default. You can press `Escape` to unfocus it, and `Enter` to focus it. If you press `Escape` while unfocused, the server  will close.

While unfocused, you can use the arrow keys to move up and down.
