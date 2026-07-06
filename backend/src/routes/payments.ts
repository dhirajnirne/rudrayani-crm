import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { getStorage } from "../services/storage/storage-provider";

/**
 * Payment capture (build brief Section 8): whichever agent closes the payment
 * records amount, mode, date, and a photo proof (camera/gallery upload). The
 * photo goes through the StorageProvider; closing the customer is an explicit
 * flag so a part-payment doesn't end the journey by accident.
 */
const router = Router();
router.use(authenticate, requirePermission("payments.record"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB — phone camera photos
});

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const paymentBody = z.object({
  customer_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  mode: z.string().trim().min(1).max(60).optional(),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  close_customer: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .default(false),
  client_key: z.string().uuid().optional(), // offline-sync idempotency key
});

/** Look up a payment previously created with this idempotency key. */
async function findByClientKey(userId: string, clientKey: string) {
  const { rows } = await pool.query(
    "SELECT * FROM payments WHERE collected_by_user_id = $1 AND client_key = $2",
    [userId, clientKey],
  );
  return rows[0] ?? null;
}

router.post(
  "/",
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const body = paymentBody.parse(req.body);
    const agencyId = req.user!.agency_id;

    // Checked before the photo is stored so a re-send doesn't orphan a copy.
    if (body.client_key) {
      const dup = await findByClientKey(req.user!.id, body.client_key);
      if (dup) {
        res.status(200).json({ payment: dup, customer_closed: false, duplicate: true });
        return;
      }
    }

    const custRes = await pool.query(
      `SELECT c.id, c.status FROM customers c
         JOIN companies co ON co.id = c.company_id
        WHERE c.id = $1 AND co.agency_id = $2`,
      [body.customer_id, agencyId],
    );
    if (!custRes.rows[0]) throw new HttpError(404, "Customer not found in this agency");
    if (custRes.rows[0].status === "closed") throw new HttpError(400, "Customer is already closed");

    let photoKey: string | null = null;
    if (req.file) {
      const ext = PHOTO_EXTENSIONS[req.file.mimetype];
      if (!ext) throw new HttpError(400, "Photo must be JPEG, PNG, or WebP");
      photoKey = await getStorage().save("payments", ext, req.file.buffer);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const payRes = await client.query(
        `INSERT INTO payments (customer_id, collected_by_user_id, amount, mode, photo_proof_url, paid_at, client_key)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, now()), $7)
         RETURNING *`,
        [
          body.customer_id,
          req.user!.id,
          body.amount,
          body.mode ?? null,
          photoKey,
          body.paid_at ?? null,
          body.client_key ?? null,
        ],
      );

      if (body.close_customer) {
        await client.query(
          `UPDATE customers SET status = 'closed', assigned_agent_id = NULL WHERE id = $1`,
          [body.customer_id],
        );
      }

      await client.query("COMMIT");
      res.status(201).json({
        payment: payRes.rows[0],
        customer_closed: body.close_customer,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      // Two retries raced: the other one won, answer with its row.
      if (
        body.client_key &&
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        const dup = await findByClientKey(req.user!.id, body.client_key);
        if (dup) {
          res.status(200).json({ payment: dup, customer_closed: false, duplicate: true });
          return;
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

/** Payment history for a customer. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const customerId = z.string().uuid().parse(req.query.customer_id);
    const { rows } = await pool.query(
      `SELECT p.id, p.amount, p.mode, p.paid_at, p.created_at,
              (p.photo_proof_url IS NOT NULL) AS has_photo,
              u.full_name AS collected_by_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = p.collected_by_user_id
        WHERE p.customer_id = $1 AND co.agency_id = $2
        ORDER BY p.paid_at DESC`,
      [customerId, req.user!.agency_id],
    );
    res.json({ payments: rows });
  }),
);

/**
 * Deposit reconciliation (Phase 5 "Deposited Metrics"): payments are pending
 * until admin/ops mark the cash as banked. Listing + bulk marking.
 */
router.get(
  "/deposits",
  requirePermission("payments.deposit"),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        deposited: z.enum(["true", "false"]).optional(),
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
        agent_id: z.string().uuid().optional(),
        company_id: z.string().uuid().optional(),
      })
      .parse(req.query);

    const conditions = ["co.agency_id = $1"];
    const params: unknown[] = [req.user!.agency_id];
    if (query.deposited === "true") conditions.push("p.deposited_at IS NOT NULL");
    if (query.deposited === "false") conditions.push("p.deposited_at IS NULL");
    if (query.month) {
      params.push(`${query.month}-01`);
      conditions.push(
        `p.paid_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND p.paid_at < ((($${params.length}::date + interval '1 month')::date)::timestamp AT TIME ZONE 'Asia/Kolkata')`,
      );
    }
    if (query.agent_id) {
      params.push(query.agent_id);
      conditions.push(`p.collected_by_user_id = $${params.length}`);
    }
    if (query.company_id) {
      params.push(query.company_id);
      conditions.push(`c.company_id = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.amount, p.mode, p.paid_at, p.deposited_at,
              c.customer_name, c.loan_number, co.name AS company_name,
              u.full_name AS collected_by_name,
              du.full_name AS deposited_by_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = p.collected_by_user_id
         LEFT JOIN users du ON du.id = p.deposited_by_user_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY p.paid_at DESC
        LIMIT 500`,
      params,
    );
    res.json({ payments: rows });
  }),
);

const markDepositedSchema = z.object({
  payment_ids: z.array(z.string().uuid()).min(1).max(500),
});

/** Idempotent bulk mark: already-deposited and foreign-agency ids are skipped. */
router.patch(
  "/mark-deposited",
  requirePermission("payments.deposit"),
  asyncHandler(async (req, res) => {
    const body = markDepositedSchema.parse(req.body);
    const { rowCount } = await pool.query(
      `UPDATE payments p
          SET deposited_at = now(), deposited_by_user_id = $1
         FROM customers c
         JOIN companies co ON co.id = c.company_id
        WHERE p.customer_id = c.id
          AND co.agency_id = $2
          AND p.id = ANY($3)
          AND p.deposited_at IS NULL`,
      [req.user!.id, req.user!.agency_id, body.payment_ids],
    );
    res.json({ ok: true, marked: rowCount ?? 0 });
  }),
);

const PHOTO_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Streams the photo proof (agency-scoped — never a raw file path). */
router.get(
  "/:id/photo",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { rows } = await pool.query(
      `SELECT p.photo_proof_url FROM payments p
         JOIN customers c ON c.id = p.customer_id
         JOIN companies co ON co.id = c.company_id
        WHERE p.id = $1 AND co.agency_id = $2`,
      [id, req.user!.agency_id],
    );
    if (!rows[0]) throw new HttpError(404, "Payment not found");
    const key: string | null = rows[0].photo_proof_url;
    if (!key) throw new HttpError(404, "No photo attached to this payment");

    const data = await getStorage().read(key);
    const ext = key.split(".").pop() ?? "jpg";
    res.setHeader("Content-Type", PHOTO_CONTENT_TYPES[ext] ?? "application/octet-stream");
    res.send(data);
  }),
);

export default router;
