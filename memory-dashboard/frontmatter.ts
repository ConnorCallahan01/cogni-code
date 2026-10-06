import yaml from "js-yaml";

export interface GrayMatterFile<T = string> {
  data: Record<string, any>;
  content: T;
  [key: string]: any;
}

function matter(raw: string): GrayMatterFile<string> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: raw };
  }
  const yamlBody = match[1];
  const content = match[2] || "";
  const parsed = yaml.load(yamlBody);
  const data = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, any>;
  return { data, content };
}

matter.stringify = function (content: string, data: Record<string, any>): string {
  const yamlStr = yaml.dump(data, { lineWidth: 120, noRefs: true });
  return `---\n${yamlStr}---\n${content}`;
};

export { matter };
export default matter;
