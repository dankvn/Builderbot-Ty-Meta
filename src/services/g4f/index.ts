import { G4F } from "g4f";


const g4f = new G4F();
export const g4f = async (ctx) => {
    const text = ctx.body;
const messages = [
    { role: "system", content: "Eres un asistente personal" },
    { role: "assistant", content: ""},
   
  ];

  const options = {
    model: "gpt-4",
    debug: true,
  };
  const response = await g4f.chatCompletion(messages,options);
  console.log(`${new Date()}\nPregunta: ${text} \nRespuesta: ${response}`);
}  