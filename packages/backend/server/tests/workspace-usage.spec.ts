import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ava, { type TestFn } from 'ava';
import { stub } from 'sinon';

import { AppModule } from '../src/app';
import { FeatureManagementService } from '../src/modules/features';
import { Quotas } from '../src/modules/quota';
import { UsersService } from '../src/modules/users';
import { PermissionService } from '../src/modules/workspaces/permission';
import { WorkspaceResolver } from '../src/modules/workspaces/resolver';
import { PrismaService } from '../src/prisma';
import { StorageProvide } from '../src/storage';
import { FakePrisma } from './utils';

class FakePermission {
  async tryCheckWorkspace() {
    return true;
  }
  async getWorkspaceOwner() {
    return {
      user: new FakePrisma().fakeUser,
    };
  }
  async getOwnedWorkspaces() {
    return [''];
  }
}

const fakeUserService = {
  getStorageQuotaById: stub(),
};

const test = ava as TestFn<{
  app: INestApplication;
  resolver: WorkspaceResolver;
}>;

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      workspaceUserPermission: {
        async findMany() {
          return [];
        },
      },
      userFeatures: {
        async count() {
          return 1;
        },
        async findFirst() {
          return {
            createdAt: new Date(),
            expiredAt: new Date(),
            reason: '',
            feature: Quotas[0],
          };
        },
      },
      features: {
        async findFirst() {
          return {
            id: 0,
            feature: 'free_plan_v1',
            version: 1,
            type: 1,
            configs: {
              name: 'Free',
              blobLimit: 1,
              storageQuota: 1,
              historyPeriod: 1,
              memberLimit: 3,
            },
          };
        },
      },
    })
    .overrideProvider(PermissionService)
    .useClass(FakePermission)
    .overrideProvider(UsersService)
    .useValue(fakeUserService)
    .overrideProvider(StorageProvide)
    .useValue({
      blobsSize() {
        return 1024 * 10;
      },
    })
    .overrideProvider(FeatureManagementService)
    .useValue({})
    .compile();
  t.context.app = module.createNestApplication();
  t.context.resolver = t.context.app.get(WorkspaceResolver);
  await t.context.app.init();
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should get blob size limit', async t => {
  const { resolver } = t.context;
  fakeUserService.getStorageQuotaById.resolves(100 * 1024 * 1024 * 1024);
  const res = await resolver.checkBlobSize(new FakePrisma().fakeUser, '', 100);
  t.not(res, false);
  // @ts-expect-error
  t.is(typeof res.size, 'number');
  fakeUserService.getStorageQuotaById.reset();
});
