import { BotContext, BotMethods } from "@builderbot/bot/dist/types"
import { getHistoryParse } from "../utils/handleHistory"
import { flowSeller } from "../flows/seller.flow"
import { flowSchedule } from "../flows/schedule.flow"

import { G4F } from "g4f";

const g4f = new G4F();

const PROMPT_DISCRIMINATOR = `### Historial de Conversación (Vendedor/Cliente) ###
{HISTORY}

### Intenciones del Usuario ###

**HABLAR**: Selecciona esta acción si el cliente parece querer hacer una pregunta o necesita más información.
**PROGRAMAR**: Selecciona esta acción si el cliente muestra intención de programar una cita.

### Instrucciones ###

Por favor, clasifica la siguiente conversación según la intención del usuario.`

export default async (ctx: BotContext, { state, gotoFlow }: BotMethods) => {
   
    const history = getHistoryParse(state)
    const prompt = PROMPT_DISCRIMINATOR
    const text = ctx.body;

    console.log(prompt.replace('{HISTORY}', history))

    const messages = [
        { role: "system", content: "Eres un asistente personal" },
        { role: "assistant", content: prompt },
        { role: "user", content: text },
      ];
      const options = {
        model: "gpt-4",
        debug: true,
        retry: {
          times: 3,
          condition: (text) => {
            const words = text.split(" ");
            return words.length > 10;
          },
        },
        output: (text) => {
          return text + " ✍";
        },
      };
  
      const response = await g4f.chatCompletion(messages, options);
  
      console.log(`${new Date()}\nPregunta: ${text} \nRespuesta: ${response}`);
      
  
      await state.get(response);

    console.log({ response })

    if (response.includes('HABLAR')) return gotoFlow(flowSeller)
    if (response.includes('PROGRAMAR')) return gotoFlow(flowSchedule)
}