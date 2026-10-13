import type {
  CreateLeadInput,
  Lead,
  LeadStatus,
  Locale,
  PaginationMeta,
  UpdateLeadInput,
} from "@semico/shared";
import { ApiError } from "../../lib/ApiError.js";
import { parsePage } from "../../lib/pagination.js";
import { leadsRepository } from "./leads.repository.js";

/**
 * Sales leads from the public lead-capture form.
 *
 * The service is small because the domain is: record an enquiry, let an owner work through it.
 * There is no notification pipeline — no mail delivery exists in this project, so a new lead is
 * visible in the dashboard rather than emailed to anyone. That limitation is deliberate and
 * documented rather than papered over with a fake "we'll be in touch" promise.
 */

type LeadRow = Awaited<ReturnType<typeof leadsRepository.create>>;

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    landArea: row.landArea,
    locale: (row.locale as Locale | null) ?? null,
    status: row.status as LeadStatus,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Empty strings from an optional form field mean "not provided", not "empty string". */
function blankToNull(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  return value.trim();
}

export const leadsService = {
  async create(input: CreateLeadInput): Promise<Lead> {
    const row = await leadsRepository.create({
      name: input.name,
      email: input.email,
      phone: blankToNull(input.phone),
      landArea: blankToNull(input.landArea),
      locale: input.locale ?? null,
    });

    return toLead(row);
  },

  async list(
    filters: { status?: string | undefined },
    page: { page?: unknown; pageSize?: unknown },
  ): Promise<{ leads: Lead[]; meta: PaginationMeta }> {
    const window = parsePage(page);
    const [rows, total] = await leadsRepository.list(filters, window);

    return {
      leads: rows.map(toLead),
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / window.pageSize)),
      },
    };
  },

  async update(id: string, input: UpdateLeadInput): Promise<Lead> {
    const existing = await leadsRepository.findById(id);
    if (!existing) throw ApiError.notFound("That lead does not exist");

    const data: { status?: string; notes?: string | null } = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.notes !== undefined) data.notes = blankToNull(input.notes);

    return toLead(await leadsRepository.update(id, data));
  },
};
