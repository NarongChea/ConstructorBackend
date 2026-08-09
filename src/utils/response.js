export const success = (res, data = {}, message = "Success", statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

export const created = (res, data = {}, message = "Created successfully") =>
  res.status(201).json({ success: true, message, data });

export const error = (res, message = "Something went wrong", statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

export const notFound  = (res, message = "Not found")    => res.status(404).json({ success: false, message });
export const unauthorized = (res, message = "Unauthorized") => res.status(401).json({ success: false, message });
export const forbidden = (res, message = "Forbidden")    => res.status(403).json({ success: false, message });
export const badRequest = (res, message = "Bad request", errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(400).json(body);
};
