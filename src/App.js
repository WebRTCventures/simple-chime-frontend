import { Box, Button, Container, TextField, Typography } from "@mui/material";
import { forwardRef, useEffect, useState } from "react";

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

    console.warn("Meeting session instance...", meetingSession);
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

async function createMeetingSession({ room }) {
  console.warn("TODO: create meeting", room);
  return null;
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
  return <p>VideoLocalOutput</p>;
}

function VideoRemoteOutput({ meetingSession }) {
  return <p>VideoRemoteOutput</p>;
}

const PeerBox = ({ enabled, ...props }) => null;

const Video = forwardRef((props, ref) => null);
