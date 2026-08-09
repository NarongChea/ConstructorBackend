import { forbidden } from "../utils/response.js";

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return forbidden(res, `Role '${req.user.role}' is not allowed to perform this action`);
  }
  next();
};
