import React, { Component } from "react";
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import Toolbar from '@material-ui/core/Toolbar';
import { Typography } from "@material-ui/core";
import LinearProgress from '@material-ui/core/LinearProgress';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';

//import axios from 'axios';

import globalVideoCall from "../utils/videocall-sdk";
import config from "../config/config";

const Transition = React.forwardRef(function Transition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const callState = {
    CALL_INIT: 0,
    CALL_BUSY: 1,           //callee in other call
    CALL_RINGING: 2,        //ring ring
    CALL_ACCEPTED: 3,       //callee accept call
    CALL_DECLINE: 4,        //callee decline
    CALL_NOT_ANSWER: 5,     //callee not hangon in a long time
    CALL_STARTED: 6,        //call start
    CALL_TIMEOUT: 7,        //time for call was ended
    CALL_ENDED: 8           //call end
    /**only timeout + ended give both, others give caller */
}

class CallComponent extends Component {
    constructor(props) {
        super(props);
        this.localVideo = React.createRef();
        this.remoteStream = React.createRef();
        this.state = {
            callStatus: this.props.type,//CALLOUTCOME,CALLINCOME, CALLFAILED, CALLDONE,SYSTEMERROR
            src: ""
        }
        this.localStream = null;
        this.callInfo = null;
        if (this.props.type === "CALLOUTCOME") {
            this.callInfo = {
                receiver_id: this.props.outcomeNumber,
                type: "VIDEO",
                start_time: new Date(),
            }
        }
    }

    componentDidMount() {
        if (!globalVideoCall.isInit()) {
            console.log("Cannot connect to video call service");
            this.setState({ callStatus: "SYSTEMERROR" });
            return;
        }

        this.setEventCall();
        if (this.props.type === "CALLOUTCOME") {
            setTimeout(() => {
                this.openStreamAction()
                    .then(() => this.localVideo.current.play())
                    .then(() => {
                        var options = {
                            stream: this.localStream,
                            isVideoCall: true,
                            //isRecording: true,
                            duration: 10
                        };
                        globalVideoCall.makeCall(this.props.outcomeNumber, options);
                    })
            }, 1000);
        }
    }

    componentWillUnmount() {
        //globalVideoCall.removeEvent("hangup");
        //globalVideoCall.removeEvent("addremotestream");
        //globalVideoCall.removeEvent("stop");
    }

    handleEndCall = () => {
        if (this.state.callStatus === "CALLFAILED")
            this.handleClose();
        else
            globalVideoCall.hangup();
    }

    handleClose = () => {
        this.props.onClose(this.state.callStatus);
    }

    handleAceptCall = () => {
        this.openStreamAction()
            .then(() => this.localVideo.current.play())
            .then(() => {
                globalVideoCall.answer({
                    stream: this.localStream,
                    success: function () {
                        console.log("ACCEPT call");
                    },
                    error: function (error) {
                        console.log("Could not answer: " + error);
                    }
                });
                if (globalVideoCall.intervalRinging)
                    globalVideoCall.ringing(false);
            })
            .then(() => this.setState({ callStatus: "CALLDONE" }))
    }

    openStreamAction = async () => {
        let fps = 0;
        this.localVideo.current.src = "movie_300.webm";
        //this.localVideo.current.src = "http://media.w3.org/2010/05/video/movie_300.webm";
        await this.localVideo.current.load();
        if (this.localVideo.current.captureStream) {
            this.localStream = this.localVideo.current.captureStream(fps);
        } else if (this.localVideo.current.mozCaptureStream) {
            this.localStream = this.localVideo.current.mozCaptureStream(fps);
        } else {
            console.error('Stream capture is not supported');
            this.localStream = null;
        }
        if (this.localStream) {
            console.log('Received local stream.');
        }
    }

    setEventCall = () => {
        /* globalVideoCall.on('answered', (stream) => {
            //this.openStreamAction();
            //this.localVideo.current.play();
            console.log("this call was answer: ", stream);
        }); */

        globalVideoCall.on('hangup', (username) => {
            console.log("Hangup by user: " + this.state.callStatus);
            if (this.localVideo.current)
                this.localVideo.current.pause();
            if (this.remoteStream.current)
                this.remoteStream.current.srcObject = null;
            if (this.state.callStatus === "CALLOUTCOME") {
                if (this.callInfo) {
                    this.callInfo.call_status = "REJECT";
                }
                this.setState({ callStatus: "CALLFAILED" });
            } else if (this.state.callStatus !== "CALLFAILED") {
                this.handleClose();
            }

            if (globalVideoCall.intervalRinging)
                globalVideoCall.ringing(false);
        });

        globalVideoCall.on('addremotestream', (stream) => {
            console.log("addremotestream: ", this.remoteStream.current);
            //this.remoteStream.current.srcObject = null;
            try {
                this.remoteStream.current.srcObject = stream;
            } catch (e) {
                console.log("Error attaching stream to element", e);
            }
            this.setState({ callStatus: "CALLDONE" });
        });

        globalVideoCall.on('stop', (result) => {
            console.log("Stop event", result);
            switch (result.call_state) {
                case callState.CALL_BUSY:
                    if (this.callInfo) {
                        this.callInfo.call_status = "BUSY";
                    }
                    break;
                case callState.CALL_DECLINE:
                    if (this.callInfo) {
                        this.callInfo.call_status = "REJECT";
                    }
                    break;
                case callState.CALL_TIMEOUT:
                    if (this.callInfo) {
                        this.callInfo.call_status = "TIMEOUT";
                    }
                    break;
                case callState.CALL_NOT_ANSWER:
                    if (this.callInfo) {
                        this.callInfo.call_status = "NOTANSWER";
                    }
                    break;
                case callState.CALL_ENDED:
                    if (this.callInfo) {
                        this.callInfo.call_status = "SUCCESS";
                        this.callInfo.start_time = result.start_time;
                        this.callInfo.duration = Math.ceil((result.stop_time - result.start_time) / 1000000);
                        this.callInfo.record_path = result.record_path;
                    }
                    break;
                default:
                    console.log("Recive call state:" + result.state);
                    return;
            }
            if (globalVideoCall.intervalRinging)
                globalVideoCall.ringing(false);
            this.saveCallInfor();
        });
    }

    handleRecallButton = () => {
        this.openStreamAction()
            .then(() => this.localVideo.current.play())
            .then(() => {
                var options = {
                    stream: this.localStream,
                    isVideoCall: true,
                    //isRecording: true,
                    duration: 10
                };
                globalVideoCall.makeCall(this.props.outcomeNumber, options);
            })
        if (this.callInfo) {
            this.callInfo.start_time = new Date();
        }
        this.setState({ callStatus: "CALLOUTCOME" });
    }

    handleDeclineButton = () => {
        globalVideoCall.reject();
    }

    saveCallInfor = () => {
        if (this.callInfo) {
            console.log("save call to DB: ", this.callInfo);
            /*axios.post(config.backend.hostname + ":" + config.backend.port + "/patient/call/createnewcall", this.callInfo)
                .then(res => {
                    //console.log(res);
                })
                .catch(error => { console.log(error); });*/
        } else {
            console.log("Callee, not write");
        }
    }

    render() {
        return (
            <Dialog open={true} fullWidth TransitionComponent={Transition}>
                <Toolbar>
                    <Typography edge="start" color="inherit" variant="h5">
                        {this.state.callStatus === "CALLOUTCOME" && "Calling"}
                        {this.state.callStatus === "CALLINCOME" && "Recv a call"}
                        {this.state.callStatus === "CALLFAILED" && "call failed"}
                        {this.state.callStatus === "CALLDONE" && "in call"}
                    </Typography>
                    {/*                     <IconButton edge="end" color="inherit" onClick={this.handleClose} aria-label="close">
                        <CloseIcon />
                    </IconButton> */}
                </Toolbar>
                {this.state.callStatus !== "SYSTEMERROR" &&
                    <DialogContent>
                        <div>
                            <Grid container justify="center" spacing={2}>
                                <Grid item xs={6} xl={6} >
                                    <Typography>My Video</Typography>
                                </Grid>
                                <Grid item xs={6} xl={6}>
                                    <Typography>Remote Video</Typography>
                                </Grid>
                                <Grid item xs={6} xl={6} >
                                    <video ref={this.localVideo} controls
                                        playsInline />
                                </Grid>
                                <Grid item xs={6} xl={6}>
                                    <video ref={this.remoteStream} autoPlay
                                        playsInline />
                                </Grid>

                            </Grid>
                        </div>
                        {(this.state.callStatus === "CALLOUTCOME" || this.state.callStatus === "CALLINCOME") && <LinearProgress color="secondary" />}
                        {this.state.callStatus === "CALLINCOME" && <Button onClick={this.handleDeclineButton}>Decline</Button>}
                        {this.state.callStatus === "CALLINCOME" && <Button onClick={this.handleAceptCall}>Acept</Button>}
                        {this.state.callStatus === "CALLFAILED" && <Button onClick={this.handleRecallButton}>Recall</Button>}
                        {this.state.callStatus !== "CALLINCOME" && <Button onClick={this.handleEndCall}>END CALL</Button>}
                    </DialogContent>
                }
                {this.state.callStatus === "SYSTEMERROR" && <DialogContent>
                    <Typography color="inherit" variant="h5">
                        Have a system error: cannot connect to call service!
                    </Typography>
                    <Button onClick={this.handleClose}>Close</Button>
                </DialogContent>}
            </Dialog >
        );
    }
}

export default CallComponent;