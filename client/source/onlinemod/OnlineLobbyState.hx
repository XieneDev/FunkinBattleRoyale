package onlinemod;

import flixel.FlxG;
import flixel.FlxSprite;
import flixel.group.FlxGroup.FlxTypedGroup;
import flixel.addons.ui.FlxUIButton;
import flixel.addons.ui.FlxInputText;
import flixel.addons.ui.FlxUIList;
import flixel.addons.ui.FlxUIState;
import flixel.text.FlxText;
import flixel.util.FlxColor;
import flixel.util.FlxAxes;
import flixel.util.FlxTimer;
import flixel.tweens.FlxTween;

import sys.FileSystem;

class OnlineLobbyState extends MusicBeatState
{
  var clientTexts:Map<Int, Int> = []; // Maps a player ID to the corresponding index in clientsGroup
  var clientsGroup:FlxTypedGroup<FlxText>; // Stores all FlxText instances used to display names
  var clientCount:Int = 0; // Amount of clients in the lobby

  static inline var NAMES_PER_ROW:Int = 5;

  public static var clients:Map<Int, String> = []; // Maps a player ID to the corresponding nickname
  public static var clientsOrder:Array<Int> = []; // This array holds ID values in order of join time (including ID -1 for self)
  public static var receivedPrevPlayers:Bool = false;

  public static var chatField:FlxInputText;
  public static var chatMessagesList:FlxUIList;
  public static var chatSendButton:FlxUIButton;
  public static var chatMessages:Array<Array<Dynamic>>;

  var keepClients:Bool;

  public function new(keepClients:Bool=false)
  {
    super();

    if (!keepClients)
    {
      clients = [];
      clientsOrder = [];
      receivedPrevPlayers = false;

      chatMessages = [];
    }

    this.keepClients = keepClients;
  }

  override function create()
  {
    var bg:FlxSprite = new FlxSprite().loadGraphic(Paths.image('onlinemod/online_bg0'));
		add(bg);


    var topText:FlxText = new FlxText(0, FlxG.height * 0.05, "Lobby");
    topText.setFormat(Paths.font("vcr.ttf"), 64, FlxColor.WHITE, LEFT, FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    topText.screenCenter(FlxAxes.X);
    add(topText);


    clientsGroup = new FlxTypedGroup<FlxText>();
    add(clientsGroup);

    for (i in clientsOrder)
    {
      var nick:String = i != -1 ? clients[i] : OnlineNickState.nickname;
      addPlayerUI(i, nick, i == -1 ? FlxColor.YELLOW : null);
    }


    addChatUI(this);


    if (!keepClients)
      OutputSystemChatMessage('${OnlineNickState.nickname} joined the game');


    OnlinePlayMenuState.AddXieneText(this);


    FlxG.mouse.visible = true;
    FlxG.autoPause = false;


    OnlinePlayMenuState.receiver.HandleData = HandleData;
    if (!keepClients)
      Sender.SendPacket(Packets.JOINED_LOBBY, [], OnlinePlayMenuState.socket);


    super.create();
  }

  function HandleData(packetId:Int, data:Array<Dynamic>)
  {
    OnlinePlayMenuState.RespondKeepAlive(packetId);
    switch (packetId)
    {
      case Packets.BROADCAST_NEW_PLAYER:
        var id:Int = data[0];
        var nickname:String = data[1];

        addPlayerUI(id, nickname);
        addPlayer(id, nickname);
        if (receivedPrevPlayers)
          OutputSystemChatMessage('$nickname joined the game');
      case Packets.END_PREV_PLAYERS:
        receivedPrevPlayers = true;
        addPlayerUI(-1, OnlineNickState.nickname, FlxColor.YELLOW);
        clientsOrder.push(-1);
      case Packets.PLAYER_LEFT:
        var id:Int = data[0];
        var nickname:String = OnlineLobbyState.clients[id];
        OutputSystemChatMessage('$nickname left the game');

        removePlayerUI(id);
        removePlayer(id);
      case Packets.GAME_START:
        var jsonInput:String = data[0];
        var folder:String = data[1];

        StartGame(jsonInput, folder);

      case Packets.BROADCAST_CHAT_MESSAGE:
        var id:Int = data[0];
        var message:String = data[1];

        OutputChatMessage('<${OnlineLobbyState.clients[id]}> $message');
    }
  }

  public static function StartGame(jsonInput:String, folder:String)
  {
    PlayState.isStoryMode = false;
    FlxG.switchState(new OnlineLoadState(jsonInput, folder));

    if (FlxG.sound.music != null)
      FlxG.sound.music.stop();
  }

  public static function addPlayer(id:Int, nickname:String)
  {
    OnlineLobbyState.clients[id] = nickname;
    OnlineLobbyState.clientsOrder.push(id);
  }

  function addPlayerUI(id:Int, nickname:String, ?color:FlxColor=FlxColor.WHITE)
  {
    var text:FlxText = new FlxText((clientCount % NAMES_PER_ROW) * FlxG.width/NAMES_PER_ROW, FlxG.height*0.2 + Std.int(clientCount / NAMES_PER_ROW) * FlxG.height*0.2, FlxG.width/NAMES_PER_ROW, nickname);
    text.setFormat(Paths.font("vcr.ttf"), 32, color, CENTER, FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    clientTexts[id] = clientsGroup.length;
    clientsGroup.add(text);
    clientCount++;
  }

  public static function removePlayer(id:Int)
  {
    OnlineLobbyState.clients.remove(id);
    clientsOrder.remove(id);
  }

  function removePlayerUI(id:Int)
  {
    var n:Int = clientTexts[id];

    for (i=>k in clientTexts)
    {
      if (k > n)
      {
        clientsGroup.members[k].x = clientsGroup.members[k - 1].x;
        clientsGroup.members[k].y = clientsGroup.members[k - 1].y;
        clientTexts[i] = clientTexts[i] - 1;
      }
    }

    clientsGroup.remove(clientsGroup.members[n], true);
    clientTexts.remove(id);
    clientCount--;
  }

  public static function OutputChatMessage(message:String, ?color:FlxColor=FlxColor.WHITE, ?register:Bool=true)
  {
    var text = new FlxText(0, 0, message);
    text.setFormat(Paths.font("vcr.ttf"), 24, color, LEFT, FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    OnlineLobbyState.chatMessagesList.add(text);

    if (OnlineLobbyState.chatMessagesList.amountNext == 0)
      OnlineLobbyState.chatMessagesList.y -= text.height + OnlineLobbyState.chatMessagesList.spacing;
    else
      OnlineLobbyState.chatMessagesList.scrollIndex += OnlineLobbyState.chatMessagesList.amountNext;

    if (register)
      RegisterChatMessage(message, color);
  }

  public static inline function RegisterChatMessage(message:String, ?color:FlxColor=FlxColor.WHITE)
  {
    OnlineLobbyState.chatMessages.push([message, color]);
  }

  public static inline function OutputSystemChatMessage(message:String)
  {
    OnlineLobbyState.OutputChatMessage(message, FlxColor.YELLOW);
  }

  public static function SendChatMessage()
  {
    if (chatField.text != '')
    {
      Sender.SendPacket(Packets.SEND_CHAT_MESSAGE, [chatField.text], OnlinePlayMenuState.socket);

      OutputChatMessage('<${OnlineNickState.nickname}> ${chatField.text}');

      chatField.text = "";
      chatField.caretIndex = 0;
    }
  }

  public static function addChatUI(state:FlxUIState)
  {
    OnlineLobbyState.chatMessagesList = new FlxUIList(10, FlxG.height - 100, FlxG.width, (24 + 1) * 7);
    state.add(OnlineLobbyState.chatMessagesList);
    for (chatMessage in OnlineLobbyState.chatMessages)
    {
      OnlineLobbyState.OutputChatMessage(chatMessage[0], chatMessage[1], false);
    }

    OnlineLobbyState.chatField = new FlxInputText(10, FlxG.height - 70, 1152, 20);
    state.add(OnlineLobbyState.chatField);

    OnlineLobbyState.chatSendButton = new FlxUIButton(10 + 1152 + 9, FlxG.height - 70, "Send", () -> {
      OnlineLobbyState.SendChatMessage();
      OnlineLobbyState.chatField.hasFocus = true;
    });
    OnlineLobbyState.chatSendButton.setLabelFormat(24, FlxColor.BLACK, CENTER);
    OnlineLobbyState.chatSendButton.resize(100, OnlineLobbyState.chatField.height);
    state.add(OnlineLobbyState.chatSendButton);
  }


  override function update(elapsed:Float)
  {
    if (!chatField.hasFocus)
    {
      OnlinePlayMenuState.SetVolumeControls(true);
      if (controls.BACK)
      {
        FlxG.switchState(new OnlinePlayMenuState());

        if (OnlinePlayMenuState.socket.connected)
        {
          OnlinePlayMenuState.socket.close();
        }
      }
    }
    else
    {
      OnlinePlayMenuState.SetVolumeControls(false);
      if (FlxG.keys.justPressed.ENTER)
      {
        SendChatMessage();
      }
    }

    super.update(elapsed);
  }
}
