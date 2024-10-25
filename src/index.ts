import fs from "fs";

import "dotenv/config";

import { idea_first_prompt, idea_reflection_prompt } from "./text";
import { getBaseDir, loadJsonFile, agents } from "./utils";

import { GraphAI } from "graphai";

const getGraphData = (
  maxNumGenerations: number,
  numReflections: number,
  ideaStrArchive: string[],
  ideaSystemPrompt: string,
  taskDescription: string,
  code: string,
) => {
  const graphData = {
    version: 0.5,
    loop: {
      count: maxNumGenerations,
      // count: 2,
    },
    nodes: {
      history: {
        value: [],
      },
      idea_str_archive: {
        value: ideaStrArchive, // array
        update: ":nextIdeas.array",
      },
      ideaPrompt: {
        agent: "stringTemplateAgent",
        params: {
          template: idea_first_prompt,
        },
        inputs: {
          taskDescription,
          code,
          numReflections,
          prev_ideas_string: ":idea_str_archive.join(,)",
        },
        isResult: true,
      },
      task1: {
        agent: "openAIAgent",
        params: {
          prompt: ":ideaPrompt",
          system: ideaSystemPrompt,
        },
        inputs: {
          messages: ":history",
        },
      },
      jsonParse: {
        agent: "jsonParserAgent",
        inputs: { text: ":task1.text" },
        isResult: true,
      },
      nextHistory: {
        agent: "arrayFlatAgent",
        inputs: {
          array: [
            ":history",
            [
              { role: "user", content: ":ideaPrompt" },
              { role: "assistant", content: ":task1.text" },
            ],
          ],
        },
      },
      improveTask: {
        agent: "nestedAgent",
        inputs: { history: ":nextHistory.array" },
        graph: {
          version: 0.5,
          loop: {
            count: numReflections - 1,
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
              inputs: { array: [":counter", 1] },
            },
            prompt: {
              agent: "stringTemplateAgent",
              params: {
                template: idea_reflection_prompt,
              },
              inputs: {
                current_round: [":counter"],
                numReflections,
              },
            },
            task2: {
              agent: "openAIAgent",
              params: {
                prompt: ":prompt",
                system: ideaSystemPrompt,
                model: "gpt-4o-mini",
              },
              inputs: {
                messages: ":history",
              },
            },
            jsonParse: {
              agent: "jsonParserAgent",
              inputs: { text: ":task2.text" },
              isResult: true,
            },
            nextHistory: {
              agent: "arrayFlatAgent",
              inputs: {
                array: [
                  ":history",
                  [
                    { role: "user", content: ":prompt" },
                    { role: "assistant", content: ":task2.text" },
                  ],
                ],
              },
              isResult: true,
            },
            debug: {
              agent: (args: any) => {
                console.log(args);
              },
              inputs: { json: ":jsonParse", a: ":nextHistory", b: ":counter", c: ":prompt" },
            },
          },
        },
      },
      resultJson: {
        isResult: true,
        agent: "jsonParserAgent",
        inputs: { data: ":improveTask.jsonParse" },
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
      debug: {
        agent: (args: any) => {
          console.log(args);
        },
        inputs: { last_history: ":improveTask.nextHistory.array" },
      },
    },
  };
  return graphData;
};

const generate_ideas = async (baseDir: string, skipGeneration = false, maxNumGenerations = 10, numReflections = 5) => {
  if (skipGeneration) {
    const ideas = loadJsonFile(baseDir + "/ideas.json");
    return ideas;
  }

  const seedIdeas = loadJsonFile(baseDir + "/seed_ideas.json");
  const ideaStrArchive = seedIdeas.map((m: unknown) => JSON.stringify(m));
  const code = fs.readFileSync(baseDir + "/experiment.py", "utf8");
  const prompt = loadJsonFile(baseDir + "/prompt.json");

  try {
    const graphData = getGraphData(maxNumGenerations, numReflections, ideaStrArchive, prompt["system"], prompt["task_description"], code);
    const graph = new GraphAI(graphData, agents);

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
