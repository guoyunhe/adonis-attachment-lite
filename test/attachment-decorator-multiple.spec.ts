/*
 * @adonisjs/attachment-lite
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import 'reflect-metadata'

import { test } from '@japa/runner'
import { join } from 'path'
import supertest from 'supertest'
import { createServer } from 'http'
import { ApplicationContract } from '@ioc:Adonis/Core/Application'
import { AttachmentContract } from '@ioc:Adonis/Addons/AttachmentLite'
import { BodyParserMiddleware } from '@adonisjs/bodyparser/build/src/BodyParser'

import { Attachment } from '../src/Attachment'
import { attachment } from '../src/Attachment/decorator'
import { setup, cleanup, setupApplication } from '../test-helpers'

let app: ApplicationContract

test.group('@attachment | multiple | insert', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('save attachment to the db and on disk', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.isUndefined(users[0].photos[0]?.url)
    assert.deepEqual(users[0].photos[0]?.toJSON(), body.avatar)

    assert.isTrue(await Drive.exists(body.avatar.name))
  })

  test('cleanup attachments when save call fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    await User.create({ username: 'virk' })

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]

        try {
          await user.save()
        } catch (error) {}

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.isNull(users[0].photos[0])
    assert.isFalse(await Drive.exists(body.avatar.name))
  })
})

test.group('@attachment | multiple | insert with transaction', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('save attachment to the db and on disk', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!
        const trx = await Db.transaction()

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.useTransaction(trx).save()

        await trx.commit()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), body.avatar)

    assert.isTrue(await Drive.exists(body.avatar.name))
  })

  test('cleanup attachments when save call fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    await User.create({ username: 'virk' })

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!
        const trx = await Db.transaction()

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]

        try {
          await user.useTransaction(trx).save()
          await trx.commit()
        } catch (error) {
          await trx.rollback()
        }

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.isNull(users[0].photos[0])
    assert.isFalse(await Drive.exists(body.avatar.name))
  })

  test('cleanup attachments when rollback is called after success', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!
        const trx = await Db.transaction()

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.useTransaction(trx).save()
        await trx.rollback()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 0)
    assert.isFalse(await Drive.exists(body.avatar.name))
  })
})

test.group('@attachment | multiple | update', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('save attachment to the db and on disk', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = await User.firstOrNew({ username: 'virk' }, {})
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const { body: secondResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), secondResponse.avatar)
    assert.isFalse(await Drive.exists(firstResponse.avatar.name))
    assert.isTrue(await Drive.exists(secondResponse.avatar.name))
  })

  test('cleanup attachments when save call fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]

        try {
          await user.save()
        } catch {}

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const { body: secondResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), firstResponse.avatar)
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))
    assert.isFalse(await Drive.exists(secondResponse.avatar.name))
  })
})

test.group('@attachment | multiple | update with transaction', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('save attachment to the db and on disk', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!
        const trx = await Db.transaction()

        const user = await User.firstOrNew({ username: 'virk' }, {}, { client: trx })
        user.photos = [Attachment.fromFile(file)]
        await user.save()
        await trx.commit()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const { body: secondResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), secondResponse.avatar)
    assert.isFalse(await Drive.exists(firstResponse.avatar.name))
    assert.isTrue(await Drive.exists(secondResponse.avatar.name))
  })

  test('cleanup attachments when save call fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!
        const trx = await Db.transaction()

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]

        try {
          await user.useTransaction(trx).save()
          await trx.commit()
        } catch {
          await trx.rollback()
        }

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const { body: secondResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), firstResponse.avatar)
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))
    assert.isFalse(await Drive.exists(secondResponse.avatar.name))
  })

  test('cleanup attachments when rollback is called after success', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!
        const trx = await Db.transaction()

        const user = await User.firstOrNew({ username: 'virk' }, {}, { client: trx })
        const isLocal = user.$isLocal

        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.useTransaction(trx).save()

        isLocal ? await trx.commit() : await trx.rollback()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const { body: secondResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), firstResponse.avatar)
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))
    assert.isFalse(await Drive.exists(secondResponse.avatar.name))
  })
})

test.group('@attachment | multiple | resetToNull', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('save attachment to the db and on disk', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')

        const user = await User.firstOrNew({ username: 'virk' }, {})
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    await supertest(server).post('/')

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.isNull(users[0].photos[0])
    assert.isFalse(await Drive.exists(firstResponse.avatar.name))
  })

  test('do not remove old file when resetting to null fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')

        const user = new User()
        user.username = 'virk'
        user.photos = file ? [Attachment.fromFile(file)] : []

        try {
          await user.save()
        } catch {}

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    await supertest(server).post('/')

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), firstResponse.avatar)
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))
  })
})

test.group('@attachment | multiple | resetToNull with transaction', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('save attachment to the db and on disk', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')
        const trx = await Db.transaction()

        const user = await User.firstOrNew({ username: 'virk' }, {}, { client: trx })
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.useTransaction(trx).save()
        await trx.commit()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    await supertest(server).post('/')

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.isNull(users[0].photos[0])
    assert.isFalse(await Drive.exists(firstResponse.avatar.name))
  })

  test('do not remove old file when resetting to null fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')
        const trx = await Db.transaction()

        const user = new User()
        user.username = 'virk'
        user.photos = file ? [Attachment.fromFile(file)] : []

        try {
          await user.useTransaction(trx).save()
          await trx.commit()
        } catch {
          await trx.rollback()
        }

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    await supertest(server).post('/')

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), firstResponse.avatar)
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))
  })

  test('do not remove old file when rollback was performed after success', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')
        const trx = await Db.transaction()

        const user = await User.firstOrNew({ username: 'virk' }, {}, { client: trx })
        const isLocal = user.$isLocal
        user.photos = file ? [Attachment.fromFile(file)] : []

        await user.useTransaction(trx).save()
        isLocal ? await trx.commit() : await trx.rollback()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    await supertest(server).post('/')

    const users = await User.all()

    assert.lengthOf(users, 1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.deepEqual(users[0].photos[0]?.toJSON(), firstResponse.avatar)
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))
  })
})

test.group('@attachment | multiple | delete', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('delete attachment when model is deleted', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')

        const user = await User.firstOrNew({ username: 'virk' }, {})
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const user = await User.firstOrFail()
    await user.delete()

    const users = await User.all()
    assert.lengthOf(users, 0)
    assert.isFalse(await Drive.exists(firstResponse.avatar.name))
  })

  test('do not delete attachment when deletion fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    User.before('delete', () => {
      throw new Error('Failed')
    })

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')

        const user = await User.firstOrNew({ username: 'virk' }, {})
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const user = await User.firstOrFail()
    try {
      await user.delete()
    } catch {}

    const users = await User.all()
    assert.lengthOf(users, 1)
    assert.deepEqual(users[0].photos[0]?.toJSON(), body.avatar)
    assert.isTrue(await Drive.exists(body.avatar.name))
  })
})

test.group('@attachment | multiple | delete with transaction', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('delete attachment when model is deleted', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')

        const user = await User.firstOrNew({ username: 'virk' }, {})
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body: firstResponse } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const user = await User.firstOrFail()
    const trx = await Db.transaction()
    await user.useTransaction(trx).delete()
    assert.isTrue(await Drive.exists(firstResponse.avatar.name))

    await trx.commit()

    const users = await User.all()
    assert.lengthOf(users, 0)
    assert.isFalse(await Drive.exists(firstResponse.avatar.name))
  })

  test('do not delete attachment when deletion fails', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const Db = app.container.resolveBinding('Adonis/Lucid/Database')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    User.after('delete', () => {
      throw new Error('Failed')
    })

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')

        const user = await User.firstOrNew({ username: 'virk' }, {})
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const user = await User.firstOrFail()
    const trx = await Db.transaction()

    try {
      await user.useTransaction(trx).delete()
    } catch {
      assert.isTrue(await Drive.exists(body.avatar.name))
      await trx.rollback()
    }

    const users = await User.all()
    assert.lengthOf(users, 1)
    assert.deepEqual(users[0].photos[0]?.toJSON(), body.avatar)
    assert.isTrue(await Drive.exists(body.avatar.name))
  })
})

test.group('@attachment | multiple | find', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('pre compute url on find', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ preComputeUrl: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('photo', join(__dirname, '../cat.jpeg'))

    const user = await User.firstOrFail()
    assert.instanceOf(user.photos[0], Attachment)
    assert.isDefined(user.photos[0]?.url)
    assert.isDefined(body.photos[0].url)

    assert.isTrue(await Drive.exists(body.photos[0].name))
  })

  test('Attachment response should be null when column value is null', async ({ assert }) => {
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ preComputeUrl: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        let user = new User()
        user.username = 'virk'
        user.photos = file ? [Attachment.fromFile(file)] : []
        await user.save()

        user = await User.firstOrFail()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server).post('/')

    assert.isNull(body.avatar)
  })

  test('do not pre compute when preComputeUrl is not enabled', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('photo')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('photo', join(__dirname, '../cat.jpeg'))

    const user = await User.firstOrFail()
    assert.instanceOf(user.photos[0], Attachment)
    assert.isUndefined(user.photos[0]?.url)
    assert.isUndefined(body.photos[0].url)

    assert.isTrue(await Drive.exists(body.photos[0].name))
  })
})

test.group('@attachment | multiple | fetch', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('pre compute url on fetch', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ preComputeUrl: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.isDefined(users[0].photos[0]?.url)
    assert.isDefined(body.avatar.url)

    assert.isTrue(await Drive.exists(body.avatar.name))
  })

  test('Attachment response should be null when column value is null', async ({ assert }) => {
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ preComputeUrl: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        await Promise.all(
          ['virk', 'ndianabasi'].map((username) => User.firstOrCreate({ username }))
        )

        const users = await User.all()

        ctx.response.send(users)
        ctx.response.finish()
      })
    })

    await supertest(server).post('/')
    const { body } = await supertest(server).post('/')

    assert.isNull(body[0].avatar)
    assert.isNull(body[1].avatar)
  })

  test('do not pre compute when preComputeUrl is not enabled', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.all()
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.isUndefined(users[0].photos[0]?.url)
    assert.isUndefined(body.avatar.url)

    assert.isTrue(await Drive.exists(body.avatar.name))
  })
})

test.group('@attachment | multiple | paginate', (group) => {
  group.setup(async () => {
    app = await setupApplication()
    await setup(app)

    app.container.resolveBinding('Adonis/Core/Route').commit()
    Attachment.setDrive(app.container.resolveBinding('Adonis/Core/Drive'))
  })

  group.each.teardown(async () => {
    await app.container.resolveBinding('Adonis/Lucid/Database').connection().truncate('users')
  })

  group.teardown(async () => {
    await cleanup(app)
  })

  test('pre compute url on paginate', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ preComputeUrl: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.query().paginate(1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.isDefined(users[0].photos[0]?.url)
    assert.isDefined(body.avatar.url)

    assert.isTrue(await Drive.exists(body.avatar.name))
  })

  test('Attachment response should be null when column value is null', async ({ assert }) => {
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ preComputeUrl: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        await Promise.all(
          ['virk', 'ndianabasi'].map((username) => User.firstOrCreate({ username }))
        )

        const users = await User.query().paginate(1)

        ctx.response.send(users)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server).post('/')

    assert.isNull(body.data[0].avatar)
    assert.isNull(body.data[1].avatar)
  })

  test('do not pre compute when preComputeUrl is not enabled', async ({ assert }) => {
    const Drive = app.container.resolveBinding('Adonis/Core/Drive')
    const { column, BaseModel } = app.container.use('Adonis/Lucid/Orm')
    const HttpContext = app.container.resolveBinding('Adonis/Core/HttpContext')

    class User extends BaseModel {
      @column({ isPrimary: true })
      public id: string

      @column()
      public username: string

      @attachment({ multiple: true })
      public photos: AttachmentContract[]
    }

    const server = createServer((req, res) => {
      const ctx = HttpContext.create('/', {}, req, res)

      app.container.make(BodyParserMiddleware).handle(ctx, async () => {
        const file = ctx.request.file('avatar')!

        const user = new User()
        user.username = 'virk'
        user.photos = [Attachment.fromFile(file)]
        await user.save()

        ctx.response.send(user)
        ctx.response.finish()
      })
    })

    const { body } = await supertest(server)
      .post('/')
      .attach('avatar', join(__dirname, '../cat.jpeg'))

    const users = await User.query().paginate(1)
    assert.instanceOf(users[0].photos[0], Attachment)
    assert.isUndefined(users[0].photos[0]?.url)
    assert.isUndefined(body.avatar.url)

    assert.isTrue(await Drive.exists(body.avatar.name))
  })
})