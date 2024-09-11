import fs from "fs";
import path from "path";

import "dotenv/config";

import { idea_first_prompt, idea_reflection_prompt } from "./text";

import { GraphAI } from "graphai";
import { openAIAgent } from "@graphai/openai_agent";
import * as vanilla_agent from "@graphai/vanilla";
import stringTemplateAgent from "./string_template_agent";

const agents = { openAIAgent, ...vanilla_agent, stringTemplateAgent };

const getBaseDir = (name: string) => {
  return path.resolve(__dirname, "../templates/" + name);
};

const loadJsonFile = (fileName: string) => {
  const fileData = fs.readFileSync(fileName, "utf8");
  const text = JSON.parse(fileData);
  return text;
};

const generate_ideas = async (baseDir: string, skipGeneration = false, maxNumGenerations = 20, num_reflections = 5) => {
  if (skipGeneration) {
    const ideas = loadJsonFile(baseDir + "/ideas.json");
    // console.log(ideas);
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

    const graph_data = {
      version: 0.5,
      loop: {
        // count: maxNumGenerations
        count: 2,
      },
      nodes: {
        history: {
          value: [],
          update: ":nextHistory.array",
        },
        idea_str_archive: {
          value: ideaStrArchive, // array
          update: ":nextIdeas.array",
        },
        joinstr: {
          agent: (inputs: string[]) => {
            return inputs.join("\n\n");
          },
          inputs: [":idea_str_archive"],
        },
        ideaPrompt: {
          agent: "stringTemplateAgent",
          params: {
            template: idea_first_prompt,
          },
          inputs: {
            task_description: prompt["task_description"],
            code,
            prev_ideas_string: ":joinstr",
            num_reflections: num_reflections,
          },
          isResult: true,
        },
        task1: {
          agent: "openAIAgent",
          params: {
            prompt: ":ideaPrompt",
            system: idea_system_prompt,
          },
          inputs: {
            messages: ":history",
          },
        },
        jsonParse: {
          agent: "jsonParserAgent",
          inputs: [":task1.choices.$0.message.content"],
          isResult: true,
        },
        messageData: {
          agent: "stringTemplateAgent",
          inputs: [":ideaPrompt", ":task1.choices.$0.message.content"],
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
          // isResult: true,
          graph: {
            version: 0.5,
            loop: {
              count: 1,
              // count: num_reflections - 1,
            },
            nodes: {
              history: {
                value: "",
                update: ":nextHistory.array",
              },
              counter: {
                value: 2, // j + 2, j is loop counter
                update: ":nextCounter",
              },
              nextCounter: {
                agent: "dataSumTemplateAgent",
                inputs: [":counter", 1],
              },
              prompt: {
                agent: "stringTemplateAgent",
                params: {
                  template: idea_reflection_prompt,
                },
                inputs: {
                  current_round: [":counter"],
                  num_reflections: num_reflections,
                },
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
              },
              debug: {
                agent: (args: any) => {
                  // console.log(args);
                },
                inputs: [":prompt"],
              },
            },
          },
        },
        resultJson: {
          isResult: true,
          agent: "jsonParserAgent",
          inputs: [":improveTask.jsonParse"],
          params: {
            stringify: true,
          },
        },
        nextIdeas: {
          agent: "arrayFlatAgent",
          inputs: {
            array: [":idea_str_archive", ":resultJson"],
          },
        },
      },
    };
    const graph = new GraphAI(graph_data, agents);
    graph.onLogCallback = ({ nodeId, state, inputs, result, inputsData }) => {
      // console.log(nodeId, state, inputs, inputsData);
    };

    const result = (await graph.run()) as any;
    // console.log(result);
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
