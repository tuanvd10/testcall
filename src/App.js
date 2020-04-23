import React, { Component } from "react";
import './App.css';
import Button from '@material-ui/core/Button';

import CallComponent from "./component/CallComponent";
import globalVideoCall from "./utils/videocall-sdk";

/**
 * 2 test numbers: 097777777 - 090000000
 */

if (globalVideoCall.isInit()) {
  globalVideoCall.connect("tuanvd10_a", {
    success: function () {
      console.log("Video Call connected...");
    },
    error: function (error) {
      console.log("Video Call could not connect: " + error);
    }
  });
} else {
  console.log("video call not init, please check!")
}
class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      callincome: false,
      callType: null
    }
  }

  componentDidMount() {
    globalVideoCall.on("incomingcall", (username) => {
      console.log("recv a video call from: " + username);
      if(!this.state.callType){
        this.setState({ callincome: true, callType: "CALLINCOME" });
        globalVideoCall.ringing(true);
      }
    });
  }

  componentWillUnmount() {
    console.log("Unmount event");
    //globalVideoCall.disconnect();
  }

  handleCloseCall = () => {
    this.setState({ callincome: false, callType: null });
  }

  handleClickButtonCall = () => {
    console.log("Start a Call to 097777777");
    if(!this.state.callType){
      this.setState({ callincome: true, callType: "CALLOUTCOME" });
    }
  }

  render() {

    return (
      <div>
        <Button onClick={this.handleClickButtonCall}>CALL OTHER</Button>
        {this.state.callType && <CallComponent type={this.state.callType} onClose={this.handleCloseCall} outcomeNumber="tuanvd10_b" />}
      </div>
    );
  }
}

export default App;
