import { prisma } from "../../db/prisma.js";

/**
 * Worker records.
 *
 * A "worker" is a `User` with `role = WORKER` attached to a farm. Every query is farm-scoped, so
 * an owner can only ever reach their own workers.
 */
export const workersRepository = {
  list(farmId: string) {
    return prisma.user.findMany({
      where: { farmId, role: "WORKER" },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        fullName: true,
        workerType: true,
        valveControl: true,
        status: true,
        createdAt: true,
      },
    });
  },

  findInFarm(farmId: string, workerId: string) {
    return prisma.user.findFirst({
      where: { id: workerId, farmId, role: "WORKER" },
      select: {
        id: true,
        email: true,
        fullName: true,
        workerType: true,
        valveControl: true,
        status: true,
        platformDisabled: true,
        createdAt: true,
      },
    });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, farmId: true, role: true },
    });
  },

  createWorker(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    farmId: string;
    workerType: string;
    valveControl: boolean;
    status: string;
  }) {
    return prisma.user.create({
      data: { ...data, role: "WORKER" },
      select: {
        id: true,
        email: true,
        fullName: true,
        workerType: true,
        valveControl: true,
        status: true,
        createdAt: true,
      },
    });
  },

  update(farmId: string, workerId: string, data: { fullName?: string; workerType?: string; status?: string }) {
    // `updateMany` with a farmId filter so a cross-farm id simply matches nothing rather than
    // being updated before we notice.
    return prisma.user.updateMany({ where: { id: workerId, farmId, role: "WORKER" }, data });
  },

  setValveControl(farmId: string, workerId: string, granted: boolean) {
    return prisma.user.updateMany({
      where: { id: workerId, farmId, role: "WORKER" },
      data: { valveControl: granted },
    });
  },

  setPassword(workerId: string, passwordHash: string) {
    return prisma.user.update({ where: { id: workerId }, data: { passwordHash } });
  },
  /**
   * Offboards a worker by disabling and detaching them — never by deleting the row.
   *
   * Deleting would be wrong twice over. `IrrigationCommand.issuedById` is a required relation with
   * no cascade, so removing anyone who had ever opened a valve would fail on a foreign key. And
   * more importantly, an audit trail whose actor can be deleted is not an audit trail: the rows
   * recording what this person did would lose the thing that makes them meaningful.
   *
   * Detaching (`farmId: null`) removes access; `DISABLED` stops them signing in at all.
   */
  detach(workerId: string) {
    return prisma.user.update({
      where: { id: workerId },
      data: { farmId: null, status: "DISABLED", valveControl: false },
    });
  },
};
