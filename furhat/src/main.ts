import { setup, createActor, fromPromise, assign } from "xstate";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

const FURHATURI = "127.0.0.1:54321";

const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1/",
  apiKey: "ollama",
});

const client = new QdrantClient({ host: "localhost", port: 6333 });

const embed = async (input: string) =>
  openai.embeddings
    .create({
      model: "qwen3-embedding",
      input: input,
      dimensions: 384,
    })
    .then((result) => result.data[0].embedding);

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

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

async function fhEvilLaugh(audioUrl: string){  
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encUrl = encodeURIComponent(audioUrl);
  return fetch(`http://${FURHATURI}/furhat/say?url=${encUrl}&lipsync=true&blocking=true`, {
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

async function fhEvilFace() {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/gesture?blocking=false`, {
    method: "POST",
    headers: myHeaders,
    body: JSON.stringify({
      name: "EvilFace",
      frames: [
        {
          time: [0.4],
          persist: true,
          params: {
            BROW_DOWN_LEFT: 1,
            BROW_DOWN_RIGHT: 1,
            EYE_SQUINT_LEFT: 0.7,
            EYE_SQUINT_RIGHT: 0.7,
            SMILE_OPEN: 0.6,
            NECK_TILT: 10,
          },
        },
        {
          time: [0.6, 1.0, 1.4, 1.8],
          persist: true,
          params: {
            PHONE_BIGAAH: 0.8,
          },
        },
        {
          time: [0.8, 1.2, 1.6, 2.0],
          persist: true,
          params: {
            PHONE_BIGAAH: 0,
          },
        },
        {
          time: [2.4],
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
    .then((body) => body!.getReader().read())
    .then((reader) => reader.value)
    .then((value) => JSON.parse(new TextDecoder().decode(value)).message);
}

const dmMachine = setup({
  actors: {
    fhVoice: fromPromise<any, null>(async () => {
      return fhVoice("en-US-EchoMultilingualNeural");
    }),
    fhHello: fromPromise<any, null>(async () => {
      return fhSay("Hey there!");
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
    Retrieval: fromPromise(async ({ input }: {input: string}): Promise<string> => {
      const embedding = await embed(input);
      // Retrieve the 5 most relevant chunks
      const results = await client.query("gu_student_support", {
        with_payload: true,
        query: embedding,
        limit: 5,
      });
      // Get the text from the retrieved results
      const texts = results.points.map((point) => point.payload?.text);
      const validTexts = texts.filter((text) => text !== undefined);
      // Combine the different retrieved chunks into one context
      return validTexts.join("\n\n");
    }),
    ChatReply: fromPromise(async ({ input }: {input: { messages: Message[]; retrievedContext: string } }): Promise<string> => {
      // Add the retrieved information to the LLM prompt
      const messagesWithContext: Message[] = [
        {
          role: "system",
          content: `Use the following retrieved GU information to answer the user:\n\n${input.retrievedContext}`,
        },
        ...input.messages,
      ];
      const completion = await openai.chat.completions.create({
        model: "llama3.2:latest",
        messages: messagesWithContext,
      });
      return completion.choices[0].message.content ?? "";
    }),
  },
}).createMachine({
  id: "root",
  context: {
    messages: [
      {
        role: "system",
        content: "You are a helpful robot assistant for university of Gothenburg students. Keep your responses short and conversational, one or two sentences at most.",
      },
    ] as Message[],
    retrievedContext: "",
  },
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
        onDone: [
          {
            // No input
            guard: ({ event }) => !event.output || event.output === "SILENCE",
            target: "NoInput",
          },
          {
            // Save the user's utterance in the dialogue history
            target: "Retrieval",
            actions: [
              ({ event }) => console.log(event.output),
              assign({
                messages: ({ context, event }) => [
                  ...context.messages,
                  { role: "user" as const, content: event.output },
                ],
              }),
            ],
          },
        ],
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    NoInput: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "fhSayAgain",
        input: "I don't hear anything. Could you say that again?",
        onDone: { target: "Listen"},
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    Retrieval: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "Retrieval",
        // Use the last two user messages as the search query
        input: ({ context }) => {
          const userMessages = context.messages.filter((m: Message) => m.role === "user");
          return userMessages.slice(-2).map((m: Message) => m.content).join("\n");
        },
        onDone: {
          target: "ChatCompletion",
          actions: assign({ retrievedContext: ({ event }) => event.output }),
        },
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    ChatCompletion: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "ChatReply",
        input: ({ context }) => ({
          messages: context.messages,
          retrievedContext: context.retrievedContext,
        }),
        onDone: {
          target: "Speaking",
          // Add the LLM answer to the dialogue history
          actions: assign({
            messages: ({ context, event }) => [
              ...context.messages,
              { role: "assistant" as const, content: event.output },
            ],
          }),
        },
        onError: {
          target: "Fail",
          actions: ({ event }) => console.error(event),
        },
      },
    },
    Speaking: {
      entry: () => fhColor(255, 0),
      invoke: {
        src: "fhSayAgain",
        // Say the last message, which is the LLM answer
        input: ({ context }) => context.messages[context.messages.length - 1].content,
        onDone: {
          target: "Listen",
          actions: [
            () => fhEvilFace(),
            () => fhEvilLaugh("https://furhatlabgu.blob.core.windows.net/sounds/laugh16k.wav"),
          ],
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