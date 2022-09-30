import { Box, Button, TextField, Typography } from "@mui/material";
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
} from "amazon-chime-sdk-js";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import {
  InvisibleAudio,
  MainContainer,
  MainHeader,
  PeerBox,
  SectionBox,
  Video,
} from "./ui-components";

export default function App() {
  const [joining, setJoining] = useState("");
  const [hadFinishedApplication, setFinishedApplication] = useState(false);
  const [meetingSession, setMeetingSession] = useState(null);
  const [hasStartedMediaInputs, setStartedMediaInputs] = useState(false);

  const handleJoin = (joiningFormData) => {
    setJoining(joiningFormData.room);
    createMeetingSession(joiningFormData)
      .then((it) => setMeetingSession(it))
      .catch(() => setJoining(""));
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

  const isInSession = !!(meetingSession && hasStartedMediaInputs);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
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
        <MainContainer>
          {hadFinishedApplication && (
            <SectionBox heading="Bye, bye!">
              You can close this window now or...{" "}
              <Button variant="text" onClick={() => window.location.reload()}>
                start another meeting
              </Button>
            </SectionBox>
          )}
          {!hadFinishedApplication && isInSession && (
            <>
              <Controls
                meetingSession={meetingSession}
                onLeave={() => setFinishedApplication(true)}
              />
              <VideoLocalOutput meetingSession={meetingSession} />
              <RemoteVideosSection meetingSession={meetingSession} />
              <AudioOutput meetingSession={meetingSession} />
            </>
          )}
          {!hadFinishedApplication && !isInSession && joining && (
            <SectionBox heading="Joining...">
              Attempting to join <code>{joining}</code> meeting.
            </SectionBox>
          )}
          {!hadFinishedApplication && !isInSession && !joining && (
            <JoiningMeeting onJoin={handleJoin} />
          )}
        </MainContainer>
      </Box>
    </ThemeProvider>
  );
}

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

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

function JoiningMeeting({ onJoin }) {
  const handleSubmit = (event) => {
    event.preventDefault();

    const joiningFormData = {
      room: event.target.room.value,
    };
    onJoin(joiningFormData);
  };

  return (
    <SectionBox>
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
    </SectionBox>
  );
}

function Controls({ meetingSession, onLeave }) {
  const muteAudio = () => meetingSession.audioVideo.realtimeMuteLocalAudio();

  const unmuteAudio = () =>
    meetingSession.audioVideo.realtimeUnmuteLocalAudio();

  const muteVideo = () => meetingSession.audioVideo.stopVideoInput();

  const unmuteVideo = async () => {
    console.error("Not implemented yet!");
  };

  const stopCall = async () => {
    meetingSession.audioVideo.stop();
    onLeave();
  };

  return (
    <SectionBox heading="Controls">
      <Button type="button" onClick={muteAudio}>
        Mute audio
      </Button>
      <Button type="button" onClick={unmuteAudio}>
        Unmute audio
      </Button>
      <Button type="button" onClick={muteVideo}>
        Mute video
      </Button>
      <Button type="button" onClick={unmuteVideo}>
        Unmute video
      </Button>
      <Button type="button" color="error" onClick={stopCall}>
        Stop call
      </Button>
    </SectionBox>
  );
}

function AudioOutput({ meetingSession }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) {
      console.error("No audio element found.");
      return;
    }

    const audioElement = audioRef.current;
    meetingSession.audioVideo.bindAudioElement(audioElement);
  }, [meetingSession]);

  return <InvisibleAudio ref={audioRef} />;
}

function VideoLocalOutput({ meetingSession }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      console.error("No local video element found.");
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
    <SectionBox heading="Video Local Output">
      <PeerBox enabled>
        <Video ref={videoRef} />
      </PeerBox>
    </SectionBox>
  );
}

// eslint-disable-next-line
function VideoRemoteOutput({ meetingSession }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      console.error("No remote video element found.");
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
    <SectionBox heading="Video Remote Output (for 1-on-1s)">
      <PeerBox enabled>
        <Video ref={videoRef} />
      </PeerBox>
    </SectionBox>
  );
}

function RemoteVideosSection({ meetingSession }) {
  const videoSlotsRef = useRef(
    Array(25)
      .fill()
      .map(() => ({ tileId: null, video: null }))
  );

  const [enabledTiles, setEnabledTiles] = useState([]);
  const enableTile = (tileId) =>
    setEnabledTiles((previous) => [...previous, tileId]);
  const disableTile = (tileId) =>
    setEnabledTiles((previous) => previous.filter((p) => p !== tileId));
  const isEnabledTile = (tileId) => enabledTiles.includes(tileId);

  useEffect(() => {
    const findSlot = (tileId) =>
      videoSlotsRef.current.find((slot) => slot.tileId === tileId) ||
      videoSlotsRef.current.find((slot) => !slot.tileId);
    const mapToAssignedSlot = (assigningTileId, assigningSlot) =>
      videoSlotsRef.current.map((slot) =>
        slot.video === assigningSlot.video
          ? { ...slot, tileId: assigningTileId }
          : slot
      );
    const mapToUnassignedSlot = (unassigningTileId) =>
      videoSlotsRef.current.map((slot) =>
        slot.tileId === unassigningTileId ? { ...slot, tileId: null } : slot
      );

    const mutateVideoSlotsRef = (updatingSlots) => {
      videoSlotsRef.current = updatingSlots;
    };

    const observer = {
      videoTileDidUpdate: (tileState) => {
        if (
          !tileState.boundAttendeeId ||
          tileState.localTile ||
          tileState.isContent
        ) {
          return;
        }

        const slot = findSlot(tileState.tileId);
        if (!slot) {
          throw new Error("Failed to find slot for remote peer.");
        }

        mutateVideoSlotsRef(mapToAssignedSlot(tileState.tileId, slot));

        if (tileState.active) {
          enableTile(tileState.tileId);
        }

        meetingSession.audioVideo.bindVideoElement(
          tileState.tileId,
          slot.video
        );
      },
      videoTileWasRemoved: (tileId) => {
        mutateVideoSlotsRef(mapToUnassignedSlot(tileId));
        disableTile(tileId);
      },
    };

    meetingSession.audioVideo.addObserver(observer);
  }, [meetingSession]);

  return (
    <Box component="section">
      <h3>Other users</h3>
      {!enabledTiles.length && (
        <Typography component="p">No remote peers have joined yet.</Typography>
      )}
      <Box>
        {videoSlotsRef.current.map((slot, index) => (
          <PeerBox
            key={index}
            title={index}
            enabled={isEnabledTile(slot.tileId)}
          >
            <Video ref={(video) => (slot.video = video)} />
          </PeerBox>
        ))}
      </Box>
    </Box>
  );
}
