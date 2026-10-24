// Type-level check (trawl-api/003): a real JSON Schema must be assignable
// to `json_schema` without a cast, and `result` reads as a free-form map.
import { Trawl } from "../src/index";

const trawl = new Trawl({ auth: { type: "apiKey", key: "pc_test" } });

const schema = {
  type: "object",
  properties: { title: { type: "string" }, price: { type: "number" } },
  required: ["title"],
};

export async function createJob() {
  const { data } = await trawl.client.POST("/v1/workspaces/{workspace_id}/jobs", {
    params: { path: { workspace_id: "00000000-0000-0000-0000-000000000000" } },
    body: { description: "Extract the title", max_steps: 20, json_schema: schema },
  });
  const result: Record<string, unknown> | null | undefined = data?.result;
  return result;
}
