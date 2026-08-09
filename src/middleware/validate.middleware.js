import { badRequest } from "../utils/response.js";

export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, allowUnknown: false });
  if (error) {
    const errors = error.details.map((d) => ({ field: d.path.join("."), message: d.message }));
    return badRequest(res, "Validation failed", errors);
  }
  next();
};
