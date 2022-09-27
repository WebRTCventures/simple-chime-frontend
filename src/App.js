import { Box, Button, Container, TextField, Typography } from "@mui/material";
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
} from "amazon-chime-sdk-js";
import axios from "axios";
import { forwardRef, useEffect, useRef, useState } from "react";

export default function App() {
  const [meetingSession, setMeetingSession] = useState(null);
  const [hasStartedMediaInputs, setStartedMediaInputs] = useState(false);

  const handleJoin = (joining) => {
    createMeetingSession(joining).then((it) => setMeetingSession(it));
  };

  useEffect(() => {
    if (!meetingSession) {
      return;
    }

    const setupInput = async ({ audioId, videoId } = {}) => {
      if (!audioId || !videoId) {
        throw new Error("No video nor audio input detected.");
      }

      if (audioId) {
        const audioInputDevices =
          await meetingSession.audioVideo.listAudioInputDevices();

        if (audioInputDevices.length) {
          await meetingSession.audioVideo.startAudioInput(audioId);
        }
      }

      if (videoId) {
        const videoInputDevices =
          await meetingSession.audioVideo.listVideoInputDevices();

        if (videoInputDevices.length) {
          const defaultVideoId = videoInputDevices[0].deviceId;
          console.warn("starting video input");
          await meetingSession.audioVideo.startVideoInput(
            videoId === "default" ? defaultVideoId : videoId
          );
          setStartedMediaInputs(true);
        }
      }
    };

    setupInput({ audioId: "default", videoId: "default" }).then(() => {
      const observer = {
        audioInputMuteStateChanged: (device, muted) => {
          console.warn(
            "Device",
            device,
            muted ? "is muted in hardware" : "is not muted"
          );
        },
      };

      meetingSession.audioVideo.addDeviceChangeObserver(observer);

      meetingSession.audioVideo.start();
    });
  }, [meetingSession]);

  return (
    <Box
      width="100%"
      paddingBottom="50px"
      paddingTop="50px"
      overflow="auto"
      display="flex"
      flexDirection="column"
      justifyContent="center"
    >
      <MainHeader />
      <MainJoiningMeeting onJoin={handleJoin} />
      {meetingSession && hasStartedMediaInputs && (
        <>
          <Controls meetingSession={meetingSession} />
          <VideoLocalOutput meetingSession={meetingSession} />
          <VideoRemoteOutput meetingSession={meetingSession} />
        </>
      )}
    </Box>
  );
}

const logger = new ConsoleLogger("Logger", LogLevel.INFO);
const deviceController = new DefaultDeviceController(logger);

async function createMeetingSession({ room }) {
  const params = new URLSearchParams([["room", room]]);
  const response = await axios.get("/chime-integration/meeting-session", {
    params,
  });

  const { meetingResponse, attendeeResponse } = response.data;
  const configuration = new MeetingSessionConfiguration(
    meetingResponse,
    attendeeResponse
  );

  const meetingSession = new DefaultMeetingSession(
    configuration,
    logger,
    deviceController
  );

  return meetingSession;
}

function MainHeader() {
  return (
    <Box component="header" textAlign="center">
      <Typography component="h1" variant="h4">
        Simple Chime App
      </Typography>
    </Box>
  );
}

function MainJoiningMeeting({ onJoin }) {
  const handleSubmit = (event) => {
    event.preventDefault();

    const joining = {
      room: event.target.room.value,
    };
    onJoin(joining);
  };

  return (
    <Container component="main" maxWidth="xs">
      <Typography component="p" variant="body1" marginTop="10px">
        Start or join a conference room.
      </Typography>
      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          name="room"
          label="Conference room"
          placeholder="Enter any alphanumeric id..."
          maxLength="64"
          minLength="2"
          margin="normal"
          fullWidth
          required
        />
        <Button type="submit" variant="contained" fullWidth>
          Start call
        </Button>
      </Box>
    </Container>
  );
}

function Controls({ meetingSession }) {
  return <p>Controls</p>;
}
function VideoLocalOutput({ meetingSession }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;

    const observer = {
      videoTileDidUpdate: (tileState) => {
        if (!tileState.boundAttendeeId || !tileState.localTile) {
          return;
        }

        meetingSession.audioVideo.bindVideoElement(
          tileState.tileId,
          videoElement
        );
      },
    };

    meetingSession.audioVideo.addObserver(observer);

    meetingSession.audioVideo.startLocalVideoTile();
  }, [meetingSession]);

  return (
    <Box component="section">
      <h3>Video Local Output</h3>
      <PeerBox enabled>
        <Video ref={videoRef} />
      </PeerBox>
    </Box>
  );
}

function VideoRemoteOutput({ meetingSession }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;

    const observer = {
      videoTileDidUpdate: (tileState) => {
        if (
          !tileState.boundAttendeeId ||
          tileState.localTile ||
          tileState.isContent
        ) {
          return;
        }

        meetingSession.audioVideo.bindVideoElement(
          tileState.tileId,
          videoElement
        );
      },
    };

    meetingSession.audioVideo.addObserver(observer);
  }, [meetingSession]);

  return (
    <Box component="section">
      <h3>Video Remote Output</h3>
      <PeerBox enabled>
        <Video ref={videoRef} />
      </PeerBox>
    </Box>
  );
}

const PeerBox = ({ enabled, ...props }) => (
  <Box
    display={enabled ? "inline-block" : "none"}
    width="200px"
    height="150px"
    backgroundColor="black"
    margin="10px"
    {...props}
  />
);

const Video = forwardRef((props, ref) => (
  <video
    ref={ref}
    width="100%"
    height="100%"
    style={{ objectFit: "cover" }}
    {...props}
  />
));
