import { Router } from "express";
import * as C from "../controllers/location.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get   ("/",    C.getLocations);
router.get   ("/:id", C.getLocationById);
router.post  ("/",    authorize("admin"), logActivity("CREATE","location"), C.createLocation);
router.patch ("/:id", authorize("admin"), logActivity("UPDATE","location"), C.updateLocation);
router.delete("/:id", authorize("admin"), logActivity("DELETE","location"), C.deleteLocation);

export default router;
