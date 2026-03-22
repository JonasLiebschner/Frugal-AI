import type { AjvFormat } from "./ajv-library-types";

const textareaFormat: AjvFormat = {
  id: "textarea",
  format: {
    validate: () => true,
  },
};

export default [textareaFormat];

