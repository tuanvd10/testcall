//import { Janus } from "react-janus-components";
import { Janus } from "./janus";
//import { Janus } from "janusjs-sdk";
import axios from "axios";

import config from "../config/config"

// Helper method to check whether WebRTC is supported by this browser
Janus.isWebrtcSupported = function () {
    console.log("isWebrtcSupported: override function");
    console.log("user media:", navigator.getUserMedia);
    return window.RTCPeerConnection ? true : false;
};

// hashmap
function HashMap() {
    var e = [];
    e.size = function () {
        return this.length
    };
    e.isEmpty = function () {
        return 0 === this.length
    };
    e.containsKey = function (e) {
        e += "";
        for (var t = 0; t < this.length; t++)
            if (this[t].key === e) return t;
        return -1
    };
    e.get = function (e) {
        e += "";
        var t = this.containsKey(e);
        if (t > -1) return this[t].value;
    };
    e.put = function (e, t) {
        let index = this.containsKey(e += "");
        if (-1 !== index)
            this.splice(index, 1, {
                key: e,
                value: t
            });
        else
            this.push({
                key: e,
                value: t
            })
    };
    e.allKeys = function () {
        for (var e = [], t = 0; t < this.length; t++) e.push(this[t].key);
        return e
    };
    e.allIntKeys = function () {
        for (var e = [], t = 0; t < this.length; t++) e.push(parseInt(this[t].key));
        return e
    };
    e.remove = function (e) {
        e += "";
        var t = this.containsKey(e);
        t > -1 && this.splice(t, 1)
    };
    e.clear = function () {
        for (var e = this.allKeys(), t = 0; t < e.length; t++) {
            var r = e[t];
            this.remove(r)
        }
    };
    return e;
}

var call_state = [
    "CALL_INIT",
    "CALL_BUSY",
    "CALL_RINGING",
    "CALL_ACCEPTED",
    "CALL_REJECT",
    "CALL_MISSED",
    "CALL_STARTED",
    "CALL_TIMEOUT",
    "CALL_ENDED"
];
// VideoCall class
function VideoCall() {
    this.isInited = false;
    this.media_server = null;
    this.admin_server = null;
    this.janus = null;
    this.plugin = null;
    this.plugin_name = null;
    this._onMethods = null;
    this.myname = null;
    this.peername = null;
    this.isConnected = false;
    this.isAttached = false;
    this.videoenabled = true;
    this.audioenabled = true;
    this.intervalRinging = null;
    this.jsep = {
        offer: null,
        answer: null
    };
}

// init 
VideoCall.prototype.init = function (callback) {
    if (!Janus.isWebrtcSupported()) {
        callback.error("No WebRTC support... ");
        return;
    }

    Janus.init({
        debug: true,
        callback: (function () {
            this.media_server = "http://" + config.video_call.hostname + ":8088/janus";
            this.admin_server = "http://" + config.video_call.hostname + ":7088/admin";
            this.plugin_name = "janus.plugin.videocall";
            this._onMethods = new HashMap();
            this.isInited = true;
            callback.success();
        }).bind(this)
    });
}

// add event to _onMethods 
VideoCall.prototype.on = function (e, t) {
    if (this._onMethods)
        this._onMethods.put(e, t);
}

VideoCall.prototype.removeEvent = function (e) {
    if (this._onMethods)
        this._onMethods.remove(e);
}

// check init
VideoCall.prototype.isInit = function () {
    return this.isInited;
}

// call event in _onMethods
VideoCall.prototype.callOnEvent = function (e, t) {
    var r = this._onMethods.get(e);
    r ? t ? r.call(this, t) : r.call(this) : console.log("Please implement event: " + e)
}

// connect to server
VideoCall.prototype.connect = function (account, callback) {
    console.log("Conecting.......");
    var self = this;
    self.janus = new Janus(
        {
            server: this.media_server,
            iceServers: [
                {
                    'urls': 'stun:bangtv.ml:3478'
                },
                {
                    'urls': 'turn:bangtv.ml:3478?transport=tcp',
                    'credential': '1231234',
                    'username': 'bangtran'
                },
                {
                    'urls': 'turn:bangtv.ml:3478?transport=udp',
                    'credential': '1231234',
                    'username': 'bangtran'
                },
                {
                    'urls': 'turn:bangtv.ml:443?transport=tcp',
                    'credential': '1231234',
                    'username': 'bangtran'
                }
            ],
            token: account,
            success: function () {
                self.isConnected = true;
                self.janus.attach(
                    {
                        plugin: self.plugin_name,
                        opaqueId: "videocalltest-" + Janus.randomString(12),
                        success: function (pluginHandle) {
                            self.plugin = pluginHandle;
                            self.isAttached = true;
                            //self.callOnEvent('connected');
                            var register = { "request": "login", "username": account };
                            self.plugin.send({ "message": register });
                            Janus.log("Plugin attached! (" + self.plugin.getPlugin() + ", id=" + self.plugin.getId() + ")");
                        },
                        onlocalstream: function (stream) {
                            Janus.log("onlocalstream");
                            //self.callOnEvent('addlocalstream', stream);
                        },
                        onremotestream: function (stream) {
                            Janus.log("onremotestream");
                            self.callOnEvent('addremotestream', stream);
                        },
                        onmessage: function (msg, jsep) {
                            Janus.debug(" ::: Got a message :::");
                            Janus.debug(msg);
                            var result = msg["result"];
                            if (result !== null && result !== undefined) {
                                if (result["event"] !== undefined && result["event"] !== null) {
                                    var event = result["event"];
                                    if (event === 'connected') {
                                        //self.callOnEvent('connected');
                                        Janus.log("Successfully connected!")
                                        callback.success();
                                    }
                                    else if (event === 'registered') {
                                        self.myname = result["username"];
                                        self.callOnEvent('registered', self.myname);
                                        Janus.log("Successfully registered as " + self.myname + "!");
                                    } else if (event === 'calling') {
                                        Janus.log("Waiting for the peer to answer...");
                                        self.callOnEvent('calling');
                                    } else if (event === 'incomingcall') {
                                        Janus.log("Incoming call from " + result["username"] + "!");
                                        self.peername = result["username"];
                                        self.jsep.answer = jsep;
                                        self.ringing(true);
                                        self.callOnEvent('incomingcall', self.peername);
                                    } else if (event === 'accepted') {
                                        var peer = result["username"];
                                        if (peer === null || peer === undefined) {
                                            console.debug("Call started!");
                                            self.ringing(false);
                                        } else {
                                            Janus.log(peer + " accepted the call!");
                                            self.peername = peer;
                                        }
                                        if (jsep)
                                            self.plugin.handleRemoteJsep({ jsep: jsep });
                                        self.callOnEvent('answered');
                                    } else if (event === 'update') {
                                        if (jsep) {
                                            if (jsep.type === "answer") {
                                                self.plugin.handleRemoteJsep({ jsep: jsep });
                                            } else {
                                                self.plugin.createAnswer(
                                                    {
                                                        jsep: jsep,
                                                        media: { data: false, audio: true, video: true },
                                                        success: function (jsep) {
                                                            Janus.debug("Got SDP!");
                                                            Janus.debug(jsep);
                                                            var body = { "request": "set" };
                                                            self.plugin.send({ "message": body, "jsep": jsep });
                                                        },
                                                        error: function (error) {
                                                            Janus.error("WebRTC error:", error);
                                                        }
                                                    });
                                            }
                                        }
                                    } else if (event === 'hangup') {
                                        Janus.log("Call hung up by " + result["username"] + " (" + result["reason"] + ")!");
                                        self.plugin.hangup();
                                        self.ringing(false);
                                        self.callOnEvent('hangup', result["username"]);
                                    }
                                    
                                    else if (event === "timeout") {
                                        self.hangup();
                                        Janus.log("The call timeout. Hangup by user " + result["username"]);
                                    } else if (event === 'stop') {

                                        console.debug("Stop event: " + call_state[result["call_state"]]);
                                        switch (call_state[result["call_state"]]) {
                                            case "CALL_ENDED":
                                            case "CALL_TIMEOUT":
                                                console.debug("+ Start time: " + result["start_time"]);
                                                console.debug("+ Stop time: " + result["stop_time"]);
                                                if (result["record_path"])
                                                    console.debug("+ Record path: " + result["record_path"]);
                                                break;
                                            case "CALL_ACCEPTED":
                                                self.ringing(false);
                                                break;

                                        }
                                        self.plugin.hangup();
                                        self.callOnEvent('stop', result["call_state"]);                                    }
                                }
                            } else {
                                let error = msg["error"];
                                console.log("error: ", error);
                                if (error.indexOf("already taken") > 0) {
                                    callback.error("Username has already taken");
                                }
                                self.plugin.hangup();
                            }
                        },
                        error: function (error) {
                            Janus.error("  -- Error attaching plugin...", error);
                        }                    });
            },
            error: function (error) {
                callback.error(error);
            },
            destroyed: function () {
                window.location.reload();
            }
        });
}

// register user
VideoCall.prototype.register = function (token, callback) {
    var self = this;
    var request = {
        janus: "add_token",
        token: token,
        plugins: ["janus.plugin.videocall"],
        transaction: Janus.randomString(12),
        admin_secret: "1231234"
    };

    axios.post(self.admin_server, request).then((json) => {
        if (json.data["janus"] !== "success") {
            callback.error(JSON.stringify(json));
            return;
        } else {
            callback.success();
        }
    }).catch((err) => {
        callback.error(err);
    });
}

// make a call
VideoCall.prototype.makeCall = function (peer, options) {
    // Call this user
    var self = this;
    if (options.stream) {
        console.log("Local stream: " + options.stream);
    }
    this.plugin.createOffer(
        {
            media: { data: false, audio: true, video: true },
            stream: options.stream ? options.stream : null,
            success: function (jsep) {
                Janus.debug("Got SDP!");
                Janus.debug(jsep);
                self.jsep.offer = jsep;
                var body = {
                    "request": "call",
                    "username": peer,
                    'videocall': options.isVideoCall ? options.isVideoCall : true,
                    'record': options.isRecording ? options.isRecording : false,
                    'duration': options.duration ? options.duration : null
                };
                self.plugin.send({ "message": body, "jsep": jsep });
                Janus.debug("Call message: " + body);
            },
            error: function (error) {
                Janus.error("WebRTC error...", error);
            }
        });
}

// answer a call
VideoCall.prototype.answer = function (options) {
    var self = this;
    this.plugin.createAnswer(
        {
            jsep: self.jsep.answer,
            media: { data: false, audio: true, video: true },
            stream: options.stream ? options.stream : null,
            success: function (jsep) {
                Janus.debug("Got SDP!");
                Janus.debug(jsep);
                self.jsep.offer = jsep;
                var body = { "request": "accept" };
                self.plugin.send({ "message": body, "jsep": jsep });
                options.success();
            },
            error: function (error) {
                options.error(error);
            }
        });
}

// mute a call
VideoCall.prototype.mute = function (isMuted) {
    this.audioenabled = isMuted;
    this.plugin.send({ "message": { "request": "set", "audio": this.audioenabled } });
}

// disable video
VideoCall.prototype.enableVideo = function (isEnable) {
    this.videoenabled = isEnable;
    this.plugin.send({ "message": { "request": "set", "video": this.videoenabled } });
}

// reject a call
VideoCall.prototype.reject = function () {
    //this.hangup();
    this.plugin.send({ "message": { "request": "reject" } });
    if (this.intervalRinging)
        this.ringing(false);
}

// hangup a call
VideoCall.prototype.hangup = function () {
    var hangup = { "request": "hangup" };
    this.plugin.send({ "message": hangup });
    //this.plugin.hangup();
}

VideoCall.prototype.disconnect = function () {
    console.log("disconecting..........................");
    this.plugin.detach();
    /* console.log("All session:", Janus.sessions);
    for (var s in Janus.sessions) {
        if (Janus.sessions[s] !== null && Janus.sessions[s] !== undefined && Janus.sessions[s].destroyOnUnload) {
            Janus.log("Destroying session " + s);
            Janus.sessions[s].destroy({ unload: true, notifyDestroyed: false });
        }
    } */
}

VideoCall.prototype.ringing = function (status) {
    /**true: ringing, false: not ringing */
    if (status) {
        var self = this;
        this.intervalRinging = setInterval(() => {
            console.log("Ring ring");
            self.plugin.send({ "message": { "request": "ringing" } })
        }, 1000);
    } else {
        if (this.intervalRinging)
            clearInterval(this.intervalRinging);
    }
}

/*
function getLocalVideoCall() {
    console.log("Geting......")
    if (!sessionStorage.videocall) {
        console.log("create new video call");
    let globalVideoCall = new VideoCall();
        sessionStorage.setItem("videocall", JSON.stringify(globalVideoCall));
        //console.log(JSON.parse(sessionStorage.videocall));
}

    let videocall = new VideoCall(sessionStorage.videocall);
    //Object.setPrototypeOf(videocall, VideoCall.prototype);
    if (videocall._onMethods)
        Object.setPrototypeOf(videocall._onMethods, HashMap.prototype);
    console.log(videocall);
    if (!videocall.isInit()) {
        videocall.init({
            success: function () {
                console.log("init video call done");
                sessionStorage.setItem("videocall", JSON.stringify(videocall));
            },
            error: function (error) {
                console.log("init video call fail: ", error)
            }
        });
    }

    return videocall;
}

var globalVideoCall = new getLocalVideoCall();
console.log("globalVideoCall: ", globalVideoCall);
*/
var globalVideoCall = new VideoCall();
globalVideoCall.init({
    success: function () {
        console.log("init video call done");
    },
    error: function (error) {
        console.log("init video call fail: ", error)
    }
});
//module.exports = { globalVideoCall: globalVideoCall };
export default globalVideoCall;