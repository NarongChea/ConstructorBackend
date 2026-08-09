import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { unauthorized } from "../utils/response.js";

export const authenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return unauthorized(res, "Not logged in");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.isActive) return unauthorized(res, "User not found or inactive");

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") return unauthorized(res, "Invalid token");
    if (err.name === "TokenExpiredError") return unauthorized(res, "Token expired");
    next(err);
  }
};
