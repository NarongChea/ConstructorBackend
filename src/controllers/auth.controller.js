import jwt from "jsonwebtoken";
import User from "../models/User.js";
import * as R from "../utils/response.js";

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };
  res.cookie("token", token, cookieOptions);
  user.password = undefined;
  res.status(statusCode).json({ success: true, message: "Success", token, data: user });
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return R.badRequest(res, "Email and password are required");

    const user = await User.findOne({ email }).select("+password");
    if (!user || !user.isActive) return R.unauthorized(res, "Invalid email or password");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return R.unauthorized(res, "Invalid email or password");

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

export const logout = (req, res) => {
  res.cookie("token", "", { httpOnly: true, expires: new Date(0) });
  R.success(res, {}, "Logged out successfully");
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    R.success(res, user);
  } catch (err) { next(err); }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return R.badRequest(res, "Both passwords are required");
    if (newPassword.length < 6) return R.badRequest(res, "New password must be at least 6 characters");

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return R.badRequest(res, "Current password is incorrect");

    user.password = newPassword;
    await user.save();
    R.success(res, {}, "Password changed successfully");
  } catch (err) { next(err); }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const user = await User.create({ name, email, password, role });
    R.created(res, user, "User created successfully");
  } catch (err) { next(err); }
};

export const getUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    R.success(res, users);
  } catch (err) { next(err); }
};

export const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role, isActive },
      { new: true, runValidators: true }
    );
    if (!user) return R.notFound(res, "User not found");
    R.success(res, user, "User updated");
  } catch (err) { next(err); }
};
