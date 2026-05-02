import { listModels } from "../models/registry.ts";

export function modelsRoute(): Response {
  return Response.json({ models: listModels() });
}
