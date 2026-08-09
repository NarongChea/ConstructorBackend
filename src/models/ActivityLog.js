import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    userName:   String,
    action:     { type: String, required: true },   // CREATE | UPDATE | DELETE
    resource:   { type: String, required: true },   // "invoice" | "employee" | ...
    resourceId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // ── Snapshots for diffing (mainly used by UPDATE/DELETE actions) ─────────
    // before = state of the document right before the change was applied
    // after  = state of the document right after the change was applied
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },

    details:   { type: mongoose.Schema.Types.Mixed },
    ip:        String,
    userAgent: String,
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

// ── Immutability guard ──────────────────────────────────────────────────────
// Activity logs are an audit trail — once written they must never be editable
// or removable through the application layer. Block every mutation path,
// including bulk ops, both at the Mongoose layer (defense-in-depth) and as
// the canonical place this rule lives, so any future code that tries to call
// .deleteOne()/.updateOne()/etc. on this model fails loudly instead of
// silently succeeding.
const BLOCK_MSG = "Activity logs are immutable and cannot be modified or deleted.";

function blockMutation(next) {
  next(new Error(BLOCK_MSG));
}

activityLogSchema.pre("deleteOne",      { document: true,  query: true  }, blockMutation);
activityLogSchema.pre("deleteMany",     { document: false, query: true  }, blockMutation);
activityLogSchema.pre("findOneAndDelete",                                  blockMutation);
activityLogSchema.pre("findOneAndUpdate",                                  blockMutation);
activityLogSchema.pre("updateOne",      { document: true,  query: true  }, blockMutation);
activityLogSchema.pre("updateMany",     { document: false, query: true  }, blockMutation);
activityLogSchema.pre("remove",         { document: true,  query: false }, blockMutation);

export default mongoose.model("ActivityLog", activityLogSchema);