import { Box, Button, Container, TextField, Typography } from "@mui/material";
import Sentiment from "sentiment";
// import AWS from "aws-sdk";
import * as AWS from "aws-sdk/global";
import * as Chime from "aws-sdk/clients/chime";
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
  DefaultActiveSpeakerPolicy,
  MessagingSessionConfiguration,
  DefaultMessagingSession,
} from "amazon-chime-sdk-js";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CssBaseline from "@mui/material/CssBaseline";
import {
  InvisibleAudio,
  MainHeader,
  PeerBox,
  SectionBox,
  Video,
  TranscriptText,
} from "./ui-components";
import {
  retrieveSpeechAnalysisAccessToken,
  retrieveSpeechAnalysisMembers,
  retrieveSpeechAnalysisTopics,
} from "./symbl-service";

export default function App() {
  const [joining, setJoining] = useState("");
  const [hadFinishedApplication, setFinishedApplication] = useState(false);
  const [meetingSession, setMeetingSession] = useState(null);
  const [hasStartedMediaInputs, setStartedMediaInputs] = useState(false);
  const [transcript, setTranscript] = useState("Text Transcript");
  window.setTranscript = setTranscript;
  const [nivelSentimental, setNivelSentimental] = useState(0);
  window.setNivelSentimental = setNivelSentimental;

  const handleJoin = (joiningFormData) => {
    setJoining(joiningFormData.room);
    createMeetingSession(joiningFormData, setTranscript, setNivelSentimental)
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

      const activeSpeakerCallback = (attendeeIds) => {
        if (!attendeeIds || !attendeeIds.length) {
          return;
        }

        const mostActiveAttendeeId = attendeeIds[0];
        const mostActiveAttendeeElement = document.getElementById(
          `video-${mostActiveAttendeeId}`
        );
        copyStreamToPinnedVideo(mostActiveAttendeeElement);
      };

      meetingSession.audioVideo.subscribeToActiveSpeakerDetector(
        new DefaultActiveSpeakerPolicy(),
        activeSpeakerCallback
      );
    });
  }, [meetingSession]);

  const isInSession = !!(meetingSession && hasStartedMediaInputs);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box width="100vw" height="100vh" overflow="hidden">
        <MainHeader />
        <Box component="main" display="flex" flexDirection="column">
          {!hadFinishedApplication && !isInSession && !joining && (
            <Container maxWidth="xs">
              <JoiningMeeting onJoin={handleJoin} />
            </Container>
          )}
          {!hadFinishedApplication && !isInSession && joining && (
            <Container maxWidth="xs">
              <SectionBox heading="Joining...">
                Attempting to join <code>{joining}</code> meeting.
              </SectionBox>
            </Container>
          )}
          {hadFinishedApplication && (
            <Container maxWidth="xs">
              <SectionBox heading="Bye, bye!">
                You can close this window now or...{" "}
                <Button variant="text" onClick={() => window.location.reload()}>
                  start another meeting
                </Button>
              </SectionBox>
            </Container>
          )}
          {!hadFinishedApplication && isInSession && (
            <>
              <StreamingVideosSection
                meetingSession={meetingSession}
                transcript={transcript}
                nivelSentimental={nivelSentimental}
              />
              <AudioOutput meetingSession={meetingSession} />
              <PinnedVideoSection />
              <Controls
                meetingSession={meetingSession}
                room={joining}
                onLeave={() => setFinishedApplication(true)}
              />
            </>
          )}
        </Box>
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

async function createMeetingSession({
  room,
  setTranscript,
  setNivelSentimental,
}) {
  const params = new URLSearchParams([["room", room]]);
  const meetingSessionResponse = await axios.get(
    "/chime-integration/meeting-session",
    {
      params,
    }
  );

  const { meetingResponse, attendeeResponse } = meetingSessionResponse.data;
  const configuration = new MeetingSessionConfiguration(
    meetingResponse,
    attendeeResponse
  );
  const meetingSession = new DefaultMeetingSession(
    configuration,
    logger,
    deviceController
  );

  const messagingSessionResponse = await axios.get(
    `/chime-integration/messaging-session/${meetingResponse.Meeting.MeetingId}`
  );
  const {
    msgChannelMembershipResponse,
    endpointResponse,
    accessKeyId,
    secretAccessKey,
    region,
  } = messagingSessionResponse.data;
  const chime = new Chime({
    region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      // sessionToken: "sessionToken"
    },
  });
  const messagingConfiguration = new MessagingSessionConfiguration(
    msgChannelMembershipResponse.Member.Arn,
    meetingResponse.Meeting.MeetingId,
    endpointResponse.Endpoint.Url,
    chime,
    AWS
  );
  window.messagingConfiguration = messagingConfiguration;
  const messagingSession = new DefaultMessagingSession(
    messagingConfiguration,
    logger
  );
  messagingSession.addObserver({
    messagingSessionDidStart: () => {
      console.log("Messaging Connection started!");
    },
    messagingSessionDidReceiveMessage: (message) => {
      console.log("Messaging Connection received message", message);
    },
  });
  window.messagingSession = messagingSession;

  window.sendMessage = async function sendMessage(content) {
    return await axios.post("/chime-integration/message", {
      channelMembership: msgChannelMembershipResponse,
      content,
    });
  };

  window.enableTranscription = async () => {
    const audioElement = document.getElementById("audio-output");
    if (!audioElement || !audioElement.srcObject) {
      console.error("Invalid audio element.", audioElement);
      return;
    }

    const tracks = audioElement.srcObject.getTracks();
    if (!tracks.length) {
      console.error("No audio tracks.");
      return;
    }

    if (tracks.length > 1) {
      console.warn(
        "Too many audio tracks, unhandled situation -- Chime SDK should have only 1, isnt?"
      );
    }

    const track = tracks[0];
    const stream = new MediaStream();
    stream.addTrack(track);

    const context = new window.AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const gainNode = context.createGain();

    source.connect(gainNode);
    gainNode.connect(processor);
    processor.connect(context.destination);

    const accessToken = await retrieveSpeechAnalysisAccessToken();
    window.accessToken = accessToken;
    const uniqueMeetingId = btoa("user@example.com");
    const symblEndpoint = `wss://api.symbl.ai/v1/realtime/insights/${uniqueMeetingId}?access_token=${accessToken}`;
    const ws = new WebSocket(symblEndpoint);

    processor.onaudioprocess = (e) => {
      // convert to 16-bit payload
      const inputData =
        e.inputBuffer.getChannelData(0) || new Float32Array(this.bufferSize);
      const targetBuffer = new Int16Array(inputData.length);
      for (let index = inputData.length; index > 0; index--) {
        targetBuffer[index] = 32767 * Math.min(1, inputData[index]);
      }
      // Send audio stream to websocket.
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(targetBuffer.buffer);
      }
    };

    const sentiment = new Sentiment();

    // Fired when a message is received from the WebSocket server
    ws.onmessage = (event) => {
      // You can find the conversationId in event.message.data.conversationId;
      const data = JSON.parse(event.data);
      if (data.type === "message" && data.message.hasOwnProperty("data")) {
        console.log("conversationId", data.message.data.conversationId);
        window.conversationId = data.message.data.conversationId;
      }
      if (data.type === "message_response") {
        for (let message of data.messages) {
          const sentimentResult = sentiment.analyze(message.payload.content);
          console.log(
            "Transcript (more accurate): ",
            message.payload.content,
            sentimentResult
          );
          window.setTranscript(message.payload.content);
          window.setNivelSentimental(sentimentResult.score);
        }
      }
      if (data.type === "topic_response") {
        for (let topic of data.topics) {
          console.log("Topic detected: ", topic.phrases);
        }
      }
      if (data.type === "insight_response") {
        for (let insight of data.insights) {
          console.log("Insight detected: ", insight.payload.content);
        }
      }
      if (
        data.type === "message" &&
        data.message.hasOwnProperty("punctuated")
      ) {
        console.log(
          "Live transcript (less accurate): ",
          data.message.punctuated.transcript
        );
      }
      console.log(`Response type: ${data.type}. Object: `, data);
    };

    // Fired when the WebSocket closes unexpectedly due to an error or lost connection
    ws.onerror = (err) => {
      console.error("ws error", err);
    };

    // Fired when the WebSocket connection has been closed
    ws.onclose = (event) => {
      console.info("Connection to websocket closed", event);
    };

    ws.onopen = (event) => {
      ws.send(
        JSON.stringify({
          type: "start_request",
          meetingTitle: "Websockets How-to", // Conversation name
          insightTypes: ["question", "action_item"], // Will enable insight generation
          config: {
            confidenceThreshold: 0.5,
            languageCode: "en-US",
            speechRecognition: {
              encoding: "LINEAR16",
              sampleRateHertz: 44100,
            },
          },
          speaker: {
            userId: "example@symbl.ai",
            name: "Example Sample",
          },
        })
      );
    };
  };

  window.retrieveSpeechAnalysisMembers = retrieveSpeechAnalysisMembers;
  window.retrieveSpeechAnalysisTopics = retrieveSpeechAnalysisTopics;

  window.meetingSession = meetingSession;
  messagingSession.start();
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

function Controls({ meetingSession, room, onLeave }) {
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
    <SectionBox
      aria-label="Room controls"
      position="absolute"
      bottom="0"
      width="100%"
      display="flex"
      justifyContent="center"
      alignItems="center"
      bgcolor="secondary.contrastText"
    >
      <Typography component="strong" variant="body1">
        (Room {room})
      </Typography>
      <Button type="button" onClick={muteAudio}>
        <MicOffIcon title="Mute audio" aria-label="Mute audio" />
      </Button>
      <Button type="button" onClick={unmuteAudio}>
        <MicIcon title="Mute audio" aria-label="Unmute audio" />
      </Button>
      <Button type="button" onClick={muteVideo}>
        <VideocamOffIcon title="Mute audio" aria-label="Mute audio" />
      </Button>
      <Button type="button" onClick={unmuteVideo}>
        <VideocamIcon title="Mute audio" aria-label="Unmute video" />
      </Button>
      <Button type="button" color="error" onClick={stopCall}>
        <Typography component="strong">End</Typography>
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

  return <InvisibleAudio id="audio-output" ref={audioRef} />;
}

function StreamingVideosSection({
  meetingSession,
  transcript,
  nivelSentimental,
}) {
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (!localVideoRef.current) {
      console.error("No local video element found.");
      return;
    }

    const videoElement = localVideoRef.current;

    const observer = {
      videoTileDidUpdate: (tileState) => {
        if (!tileState.boundAttendeeId || !tileState.localTile) {
          return;
        }

        meetingSession.audioVideo.bindVideoElement(
          tileState.tileId,
          videoElement
        );
        videoElement.id = `video-${tileState.boundAttendeeId}`;
      },
    };

    meetingSession.audioVideo.addObserver(observer);

    meetingSession.audioVideo.startLocalVideoTile();
  }, [meetingSession]);

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
        slot.video.id = `video-${tileState.boundAttendeeId}`;
      },
      videoTileWasRemoved: (tileId) => {
        mutateVideoSlotsRef(mapToUnassignedSlot(tileId));
        disableTile(tileId);
      },
    };

    meetingSession.audioVideo.addObserver(observer);
  }, [meetingSession]);

  return (
    <SectionBox
      aria-label="Streaming videos"
      display="flex"
      justifyContent="center"
    >
      <Box>
        <PeerBox
          title="Local user"
          enabled
          style={
            nivelSentimental === 0
              ? {}
              : nivelSentimental > 0
              ? { border: "4px solid green" }
              : nivelSentimental < 0
              ? { border: "4px solid red" }
              : {}
          }
        >
          <Video
            ref={localVideoRef}
            className="streaming-video streaming-video-local"
          />
          <TranscriptText text={transcript} />
        </PeerBox>
        {videoSlotsRef.current.map((slot, index) => (
          <PeerBox
            key={index}
            title={`Remote user #${index}`}
            enabled={isEnabledTile(slot.tileId)}
          >
            <Video
              ref={(video) => (slot.video = video)}
              className="streaming-video streaming-video-remote"
            />
          </PeerBox>
        ))}
      </Box>
    </SectionBox>
  );
}

function PinnedVideoSection() {
  const videoRef = useRef(null);

  useEffect(() => {
    const workerId = setInterval(() => {
      if (videoRef.current.srcObject && videoRef.current.srcObject.active) {
        return;
      }

      const foundActiveStreamingElement = Array.from(
        document.getElementsByClassName("streaming-video")
      ).find((el) => el.srcObject && el.srcObject.active);
      copyStreamToPinnedVideo(foundActiveStreamingElement, videoRef.current);
    }, 3000);
    return () => clearInterval(workerId);
  }, []);

  return (
    <Video
      ref={videoRef}
      id="video-pinned"
      aria-label="Pinned video"
      style={{ maxHeight: "80vh", objectFit: "contain" }}
      width={undefined}
      height={undefined}
    />
  );
}

function copyStreamToPinnedVideo(
  originatingVideoElement,
  pinnedVideoElement = document.getElementById("video-pinned")
) {
  if (!originatingVideoElement || !originatingVideoElement.srcObject) {
    console.error(
      "Invalid originating video element/stream",
      originatingVideoElement
    );
    return;
  }

  if (!pinnedVideoElement) {
    console.error("Invalid pinned video element", pinnedVideoElement);
    return;
  }

  if (pinnedVideoElement.srcObject === originatingVideoElement.srcObject) {
    return;
  }

  pinnedVideoElement.muted = true;
  pinnedVideoElement.volume = 0;
  pinnedVideoElement.setAttributeNode(document.createAttribute("autoplay"));
  pinnedVideoElement.setAttributeNode(document.createAttribute("playsinline"));
  pinnedVideoElement.srcObject = originatingVideoElement.srcObject;
}
