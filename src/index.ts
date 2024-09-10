import fs from "fs";
import path from "path";

import "dotenv/config";

import { idea_first_prompt, idea_reflection_prompt } from "./text";

import { GraphAI } from "graphai";
import { openAIAgent } from "@graphai/openai_agent";
import * as vanilla_agent from "@graphai/vanilla";

const agents = { openAIAgent, ...vanilla_agent };

const getBaseDir = (name: string) => {
  return path.resolve(__dirname, "../templates/" + name);
};

const loadJsonFile = (fileName: string) => {
  const fileData = fs.readFileSync(fileName, "utf8");
  const text = JSON.parse(fileData);
  return text;
};

const formatString = (text: string, dataSet: Record<string, string>) => {
  return Object.entries(dataSet).reduce((tmp, [key, value]) => {
    return tmp.replaceAll("{" + key + "}", value);
  }, text);
};

// const load

// mock
const get_response_from_llm = (message: string, system_message: string, llm: string, model: string, message_history: string[] = []) => {
  const text = "";
  const msg_history: string[] = [];

  return [text, msg_history];
};

const generate_ideas = async (baseDir: string, skipGeneration = false, maxNumGenerations = 20, num_reflections = 5) => {
  if (skipGeneration) {
    const ideas = loadJsonFile(baseDir + "/ideas.json");
    console.log(ideas);
    return ideas;
  }

  const seedIdeas = loadJsonFile(baseDir + "/seed_ideas.json");
  const ideaStrArchive = seedIdeas.map((m: unknown) => JSON.stringify(m));
  const code = fs.readFileSync(baseDir + "/experiment.py", "utf8");
  const prompt = loadJsonFile(baseDir + "/prompt.json");

  const idea_system_prompt = prompt["system"];

  try {
    const prev_ideas_string = ideaStrArchive.join("\n\n");

    console.log(`Iteration 1/${num_reflections}`);
    const message = formatString(idea_first_prompt, {
      task_description: prompt["task_description"],
      code,
      prev_ideas_string,
      num_reflections: String(num_reflections),
    });
    // console.log(message);

    const graph_data = {
      version: 0.5,
      loop: {
        //  count: max_num_generations,
        count: 1,
      },
      nodes: {
        message: {
          value: message,
        },
        history: {
          value: [],
          update: ":nextHistory.array",
        },
        task1: {
          agent: "openAIAgent",
          params: {
            prompt: message,
            system: idea_system_prompt,
          },
          inputs: {
            messages: ":history",
          }
        },
        jsonParse: {
          agent: "jsonParserAgent",
          inputs: [":task1.choices.$0.message.content"],
          isResult: true,
        },
        messageData: {
          agent: "stringTemplateAgent",
          inputs: [":message", ":task1.choices.$0.message.content"],
          params: {
            template: [
              { role: "user", content: "${0}" },
              { role: "assistant", content: "${1}" },
            ],
          },
        },
        nextHistory: {
          agent: "arrayFlatAgent",
          inputs: {
            array: [":history", ":messageData"],
          },
        },
        improveTask: {
          agent: "nestedAgent",
          inputs: { history: ":nextHistory.array" },
          isResult: true,
          graph: {
            version: 0.5,
            loop: {
              //count: 1,
              count: num_reflections - 1,
            },
            nodes: {
              history: {
                value: "",
                update: ":nextHistory.array"
              },
              task2: {
                agent: "openAIAgent",
                params: {
                  prompt: idea_reflection_prompt,
                  system: idea_system_prompt,
                },
                inputs: {
                  messages: ":history",
                },
              },
              jsonParse: {
                agent: "jsonParserAgent",
                inputs: [":task2.choices.$0.message.content"],
                isResult: true,
              },
              messageData: {
                agent: "stringTemplateAgent",
                inputs: [idea_reflection_prompt, ":task2.choices.$0.message.content"],
                params: {
                  template: [
                    { role: "user", content: "${0}" },
                    { role: "assistant", content: "${1}" },
                  ],
                },
              },
              nextHistory: {
                agent: "arrayFlatAgent",
                inputs: {
                  array: [":history", ":messageData"],
                },
                isResult: true,
              },
              debug: {
                agent: (args: any) => {
                  console.log(args);
                },
                inputs: [
                  ":jsonParse",
                ],
              },
            },
          },
        },
      },
    };
    const graph = new GraphAI(graph_data, agents);
    graph.onLogCallback = ({ nodeId, state, inputs, result, inputsData }) => {
      // console.log(nodeId, state, inputs, inputsData);
    };

    const result = (await graph.run()) as any;
    console.log(result);

  } catch (e) {
    console.log(e);
  }
};

const main = async () => {
  const experiment = "grokking";

  const baseDir = getBaseDir(experiment);
  await generate_ideas(baseDir);
};

main();
