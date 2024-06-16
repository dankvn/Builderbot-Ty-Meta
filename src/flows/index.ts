import { createFlow } from "@builderbot/bot";
import { welcomeFlow } from "./welcome.flow";
import { flowSeller } from "./seller.flow";
import { flowSchedule } from "./schedule.flow";
import { flowConfirm } from "./confirm.flow";
import { flowVoiceNote } from "./voice.flow";
import { flowOrden } from "./orden.flow";


export default createFlow([welcomeFlow, flowSeller, flowSchedule, flowConfirm,flowVoiceNote,flowOrden])