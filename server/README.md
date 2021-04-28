# Server

The server is built with [Node.js](https://nodejs.org), and uses [blessed](https://github.com/chjj/blessed) as a dependency.

# How to use it

You'll need to start by installing [Node.js](https://nodejs.org) and [npm](https://www.npmjs.com/) (which usually comes packaged with the Node.js installer).

After that, save all the server files on a folder, and open a console there.
Run `npm install`.

Change the port on **settings.json** to what you have set up. For other people to play with you, you'll need to set up Port Forwarding or use a service like [Hamachi](https://www.vpn.net/).

After everything is done, run `node server`.

You should now see a console that looks something like this:

![](https://cdn.discordapp.com/attachments/834499801848217685/836345890653732914/console.PNG)

Now you can start typing commands.

# Adding Songs

To add a song, you'll need to copy the folder and the file into the **data** folder of the server. For example: `data/milf/milf-hard.json`. It's important that you structure it like that. You'll have to add this file even for songs included in the base game.

To add the audio files, you'll similarly create a folder in the **songs** folder like this: `songs/milf/Voices.ogg` and `songs/milf/Inst.ogg`. You don't need to add these files for songs not in the base game.

# Commands

- **help**: displays a list of all commands, with a short description of what they do.
- **count**: Tells you how many players are connected to the server.
- **list**: Tells you the names and IDs of the players connected to the server.
- **start**: Starts the game, according to the song that was set using `setsong`.
- **setsong**: Sets the song to be played. Takes 2 arguments: **folder** and **file**. This will look for a chart in `data/'folder'/'file'.json`. If it doesn't find a file there the command will fail.
- **exit**: Closes the server.

# Options

There's a **settings.json** file in which you can change some options:

- **port**: the port on which the server will be open. Has to be a number between 1 and 65,535.
- **password**: The password that players will have to insert to join the server. Default: 'admin'.
- **keep_alive**: How often to send keep alive packets to the players, in milliseconds. Unless you know what you are doing, don't touch this setting. Default: 10 seconds (10000 milliseconds).
- **wait**: How long to wait for players to be ready, in milliseconds. After the first player is ready to start playing, the server will wait this amount of time, and if everyone still isn't ready, everyone that's not ready will be kicked from the server and the match will start. Default: 20 seconds (20000 milliseconds).
- **safe_frames**: A Kade Engine setting, controls how early/late you can hit a note. Default: 10.
