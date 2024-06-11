import { addKeyword, EVENTS } from "@builderbot/bot";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { generateTimer } from "../utils/generateTimer";
import { getCurrentCalendar } from "../services/calendar";
import { getFullCurrentDate } from "src/utils/currentDate";
import { flowConfirm } from "./confirm.flow";
import { addMinutes, isWithinInterval, format, parse, getDay } from "date-fns";
import { G4F } from "g4f";

const DURATION_MEET = process.env.DURATION_MEET ?? 45;

const g4f = new G4F();

const PROMPT_FILTER_DATE = `
### Contexto
Eres un asistente de inteligencia artificial. Tu propósito es determinar la fecha y hora que el cliente quiere, en el formato yyyy/MM/dd HH:mm:ss.Evita agendar los domingos y fuera del horario 10:00 a 19:00.

### Fecha y Hora Actual:
{CURRENT_DAY}

### Registro de Conversación:
{HISTORY}

### INSTRUCIONES
- NO Agendar en el siguiente horario de Lunes a Sabado.
- NO Agendar en horario de almuezo 13:00 a 14:00.



Asistente: "{respuesta en formato (yyyy/MM/dd HH:mm:ss)}"
`;

const generatePromptFilter = (history) => {
  const nowDate = getFullCurrentDate();
  const mainPrompt = PROMPT_FILTER_DATE.replace("{HISTORY}", history).replace(
    "{CURRENT_DAY}",
    nowDate
  );

  return mainPrompt;
};

const flowSchedule = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
    await flowDynamic("Dame un momento para consultar la agenda...");
    const history = getHistoryParse(state);
    const list = await getCurrentCalendar();

    const listParse = list
      .map((d) => parse(d, "yyyy/MM/dd HH:mm:ss", new Date()))
      .map((fromDate) => ({
        fromDate,
        toDate: addMinutes(fromDate, +DURATION_MEET),
      }));

    const promptFilter = generatePromptFilter(history);

    const messages = [
      { role: "system", content: "Eres un asistente personal" },
      { role: "assistant", content: promptFilter },
    ];

    const options = {
      model: "gpt-4",
      debug: true,
    };

    const response = await g4f.chatCompletion(messages, options);
    console.log(`${new Date()}\nRespuesta de G4F: ${response}`);

    const date = response.trim();

    const desiredDate = parse(date, "yyyy/MM/dd HH:mm:ss", new Date());


    const isDateAvailable = listParse.every(
      ({ fromDate, toDate }) =>
        !isWithinInterval(desiredDate, { start: fromDate, end: toDate })
    );

    if (!isDateAvailable) {
      const m =
        "Lo siento, esa hora ya está reservada. ¿Alguna otra fecha y hora?";
      await flowDynamic(m);
      await handleHistory({ content: m, role: "assistant" }, state);
      await state.update({ desiredDate: null });
      return;
    }

    const formattedDateFrom = format(desiredDate, "hh:mm a");
    const formattedDateTo = format(
      addMinutes(desiredDate, +DURATION_MEET),
      "hh:mm a"
    );
    const message = `¡Perfecto! Tenemos disponibilidad de ${formattedDateFrom} a ${formattedDateTo} el día ${format(
      desiredDate,
      "dd/MM/yyyy"
    )}. ¿Confirmo tu reserva? *si*`;
    await handleHistory({ content: message, role: "assistant" }, state);
    await state.update({ desiredDate });

    const chunks = message.split(/(?<!\d)\.\s+/g);
    for (const chunk of chunks) {
      await flowDynamic([
        { body: chunk.trim(), delay: generateTimer(150, 250) },
      ]);
    }
  })
  .addAction(
    { capture: true },
    async ({ body }, { gotoFlow, flowDynamic, state }) => {
      if (body.toLowerCase().includes("si")) return gotoFlow(flowConfirm);

      await flowDynamic("¿Alguna otra fecha y hora?");
      await state.update({ desiredDate: null });
    }
  );

export { flowSchedule };