import type { Request, Response } from "express";
import * as kycService from "../services/kyc";
import { OrderError } from "../services/orders";

export async function listDocs(req: Request, res: Response): Promise<void> {
  const docs = await kycService.listDocs(req.merchant!.id);
  res.json(docs);
}

export async function uploadDoc(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    docType?: string;
    filename?: string;
    dataUri?: string;
  };
  if (!body.docType || !body.filename || !body.dataUri) {
    res.status(400).json({ error: "docType, filename, dataUri required" });
    return;
  }
  try {
    const doc = await kycService.uploadDoc({
      merchantId: req.merchant!.id,
      docType: body.docType,
      filename: body.filename,
      dataUri: body.dataUri,
    });
    res.status(201).json(doc);
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Upload failed" });
  }
}

export async function deleteDoc(req: Request, res: Response): Promise<void> {
  await kycService.deleteDoc({
    id: String(req.params["id"]),
    merchantId: req.merchant!.id,
  });
  res.json({ ok: true });
}
