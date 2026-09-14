import { z } from "zod";
import { ADMIN_DEPARTMENTS } from "./types";

export const uuid = () => z.uuid();

export const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const closed = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict();

export const ticketScoped = closed({ ticketId: uuid() });

export const departmentEnum = z.enum(ADMIN_DEPARTMENTS);
