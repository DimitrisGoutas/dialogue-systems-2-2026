import { setup, createActor, fromPromise, assign } from "xstate";

const FURHATURI = "127.0.0.1:54321";

async function fhVoice(name: string) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encName = encodeURIComponent(name);
  return fetch(`http://${FURHATURI}/furhat/voice?name=${encName}`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function fhSay(text: string) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encText = encodeURIComponent(text);
  return fetch(`http://${FURHATURI}/furhat/say?text=${encText}&blocking=true`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function fhAttend(lookAt: string){
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/attend?user=${lookAt}`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function fhColor(red: number, green: number){
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/led?red=${red}&green=${green}`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function newGesture() {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/gesture?blocking=false`, {
    method: "POST",
    headers: myHeaders,
    body: JSON.stringify({
      name: "newGesture",
      frames: [
        {
          time: [0.5],
          persist: true,
          params: {
            SMILE_OPEN: 1,
            BLINK_LEFT: 1,
          },
        },
        {
          time: [1.5],
          persist: true,
          params: {
            reset: true,
          },
        },
      ],
      class: "furhatos.gestures.Gesture",
    }),
  });
}

async function fhGesture(text: string) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(
    `http://${FURHATURI}/furhat/gesture?name=${text}&blocking=true`,
    {
      method: "POST",
      headers: myHeaders,
      body: "",
    },
  );
}

async function fhListen() {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/listen`, {
    method: "GET",
    headers: myHeaders,
  })
    .then((response) => response.body)
    .then((body) => body.getReader().read())
    .then((reader) => reader.value)
    .then((value) => JSON.parse(new TextDecoder().decode(value)).message);
}

const dmMachine = setup({
  actors: {
    fhVoice: fromPromise<any, null>(async () => {
      return fhVoice("en-US-EchoMultilingualNeural");
    }),
    fhHello: fromPromise<any, null>(async () => {
      return fhSay("Hi");
    }),
    fhLook: fromPromise<any, null>(async () => {
      return fhAttend("CLOSEST")
    }),
    fhL: fromPromise<any, null>(async () => {
     return fhListen();
    }),
    fhSayAgain: fromPromise<any, string>(async ({input}) => {
      return fhSay(input)
    }),
  },
}).createMachine({
  id: "root",
  context: {userMessage: ""}, 
  initial: "Start",
  states: {
    Start: { after: { 1000: "Look" } },
    Look: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "fhLook",      
        input: null,
        onDone: {
          target: "Next",
          actions: ({ event }) => console.log(event.output),
        },
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    Next: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "fhHello",      
        input: null,
        onDone: {
          target: "Listen",
          actions: [
            ({ event }) => console.log(event.output),
            () => newGesture(),
          ],
        },
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    Listen: {
      entry: () => fhColor(0, 255),
      invoke: {
        src: "fhL",
        input: null,
        onDone: {
          target: "Repeat",
          actions: [
            ({ event }) => console.log(event.output),
            assign({ userMessage: ({ event }) => event.output }),
          ],
        },
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    Repeat: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "fhSayAgain",
        input: ({context}) => context.userMessage,
        onDone: {
          target: "Listen",
          actions: () => newGesture(),
        },
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    Fail: {},
  },
});

const actor = createActor(dmMachine).start();
console.log(actor.getSnapshot().value);

actor.subscribe((snapshot) => {
  console.log(snapshot.value);
  console.log(snapshot.context);
});

