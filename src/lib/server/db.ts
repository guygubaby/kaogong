import { PrismaClient } from '../../generated/prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { runtime } from './runtime'

export function database() {
  return new PrismaClient({ adapter: new PrismaD1(runtime().env.DB) })
}
