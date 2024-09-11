import fs from "fs";
import path from "path";

import { openAIAgent } from "@graphai/openai_agent";
import * as vanilla_agent from "@graphai/vanilla";

export const agents = { openAIAgent, ...vanilla_agent };

export const getBaseDir = (name: string) => {
  return path.resolve(__dirname, "../templates/" + name);
};

export const loadJsonFile = (fileName: string) => {
  const fileData = fs.readFileSync(fileName, "utf8");
  const text = JSON.parse(fileData);
  return text;
};
