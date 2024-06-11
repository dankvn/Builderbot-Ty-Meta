import { addKeyword, EVENTS } from "@builderbot/bot";
import fs from "fs/promises";
import { generateTimer } from "../utils/generateTimer";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { getFullCurrentDate } from "src/utils/currentDate";
import { pdfQuery } from "src/services/pdf";
import { G4F } from "g4f";
import { transcribeAudio } from "src/services/whiper";

const PROMPT_SELLER = `Como experto en ventas con aproximadamente 15 años de experiencia en embudos de ventas y generación de leads, tu tarea es mantener una conversación agradable, responder a las preguntas del cliente sobre nuestros productos y, finalmente, guiarlos para reservar una cita. Tus respuestas deben basarse únicamente en el contexto proporcionado:

### DÍA ACTUAL
{CURRENT_DAY}

### HISTORIAL DE CONVERSACIÓN (Cliente/Vendedor)
{HISTORY}

### BASE DE DATOS
{DATABASE}

Para proporcionar respuestas más útiles, puedes utilizar la información proporcionada en la base de datos. El contexto es la única información que tienes. Ignora cualquier cosa que no esté relacionada con el contexto.

### EJEMPLOS DE RESPUESTAS IDEALES:

- buenas bienvenido a..
- un gusto saludarte en..
- por supuesto tenemos eso y ...

### INTRUCCIONES
- Mantén un tono profesional y siempre responde en primera persona.
- NO ofrescas promociones que no existe en la BASE DE DATOS
- NO respondas con saludo
- Respuestas cortas ideales para enviar por whatsapp con emojis.

Respuesta útil adecuadas para enviar por WhatsApp (en español):`;

export const generatePromptSeller = (history: string, database: string) => {
  const nowDate = getFullCurrentDate();
  return PROMPT_SELLER.replace("{HISTORY}", history)
    .replace("{CURRENT_DAY}", nowDate)
    .replace("{DATABASE}", database);
};

const g4f = new G4F();

const flowVoiceNote = addKeyword(EVENTS.VOICE_NOTE)
  .addAnswer("Dame un momento para escucharte...🙉")
  .addAction(async (ctx, { provider, state, flowDynamic }) => {
    const tempDir = "./tmp";
    try {
      // Crear directorio temporal si no existe
      await fs.mkdir(tempDir, { recursive: true });

      // Guardar el archivo en el directorio temporal
      const localPath = await provider.saveFile(ctx, { path: tempDir });
      if (!localPath) {
        console.log(
          "Error: La ruta del archivo es inválida o no se pudo guardar el archivo."
        );
        return;
      }
      console.log(`🤖 Fin voz a texto....[TEXT]: ${localPath}`);

      // Transcribir el audio y obtener el texto
      const transcriptionResult = await transcribeAudio(localPath);

      if (transcriptionResult) {
        // Extrae y muestra el texto transcrito
        const transcribedText = transcriptionResult.transcription;
        console.log(`🤖 Transcribed Text: ${transcribedText}`);

        try {
          const history = getHistoryParse(state);
          const dataBase = await pdfQuery(transcribedText);
          console.log({ dataBase });
          const promptInfo = generatePromptSeller(history, dataBase);

          // Crear los mensajes para la API de chat
          const messages = [
            { role: "system", content: "Eres un asistente personal" },
            { role: "assistant", content: promptInfo },
          ];

          const options = {
            model: "gpt-4",
            debug: true,
          };

          // Obtener la respuesta del bot
          const response = await g4f.chatCompletion(messages, options);
          await handleHistory({ content: response, role: "assistant" }, state);
          const chunks = dataBase.split(/(?<!\d)\.\s+/g);
          console.log(
            `${new Date()}\nPregunta: ${transcribedText} \nRespuesta: ${dataBase}`
          );
          for (const chunk of chunks) {
            await flowDynamic([
              { body: chunk.trim(), delay: generateTimer(150, 250) },
            ]);
          }
        } catch (err) {
          console.log(`[ERROR]:`, err);
          return;
        }
      } else {
        console.log("🤖 No se pudo transcribir el audio.");
        // Si no se puede transcribir el audio, maneja el error apropiadamente
      }
    } catch (err) {
      console.log(`[ERROR]:`, err);
    }
  });

export { flowVoiceNote };
