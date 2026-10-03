const { expect } = require('chai')
const { ethers } = require('hardhat')
const { loadFixture, time } = require('@nomicfoundation/hardhat-toolbox/network-helpers')
const { TYPES, domain } = require('../lib/terms')

const usd = (n) => ethers.parseUnits(String(n), 6)
const DAY = 86_400
const text = (s) => ethers.keccak256(ethers.toUtf8Bytes(s))
const S = { Working: 0n, Submitted: 1n, Paid: 2n, Disputed: 3n, Resolved: 4n, Reclaimed: 5n }
const P = { None: 0n, Active: 1n, Done: 2n, Cancelled: 3n }

async function deploy() {
  const [owner, lead, ada, tobi, reviewer, stranger] = await ethers.getSigners()
  const usdc = await (await ethers.getContractFactory('MockUSDC')).deploy()
  const vault = await (await ethers.getContractFactory('CrewPayVault')).deploy(usdc, false, reviewer, owner)
  await usdc.mint(lead, usd(10_000))
  await usdc.connect(lead).approve(vault, ethers.MaxUint256)
  const now = await time.latest()

  // Ada: $700, 20% deposit, two milestones. Tobi: $900, 20% deposit, one milestone with 1 revision.
  const terms = {
    projectId: ethers.id('oja-shop'),
    lead: lead.address,
    version: 1,
    roles: [
      {
        collaborator: ada.address,
        deposit: usd(140),
        milestones: [
          { amount: usd(280), due: now + 10 * DAY, revisions: 2, doneWhen: text('Home + catalogue in Figma') },
          { amount: usd(280), due: now + 20 * DAY, revisions: 2, doneWhen: text('Remaining 3 pages in Figma') },
        ],
      },
      {
        collaborator: tobi.address,
        deposit: usd(180),
        milestones: [{ amount: usd(720), due: now + 15 * DAY, revisions: 1, doneWhen: text('Live on staging, Lighthouse 85+') }],
      },
    ],
  }
  const { chainId } = await ethers.provider.getNetwork()
  const dom = domain(chainId, await vault.getAddress())
  const sign = (signer, t = terms) => signer.signTypedData(dom, TYPES, t)
  const sigs = [await sign(ada), await sign(tobi)]
  return { vault, usdc, owner, lead, ada, tobi, reviewer, stranger, terms, sigs, sign, dom }
}

async function funded() {
  const f = await deploy()
  await f.vault.connect(f.lead).fund(f.terms, f.sigs)
  return f
}

const pid = ethers.id('oja-shop')

describe('CrewPayVault', () => {
  describe('funding with signed terms', () => {
    it('matches the EIP-712 digest wallets sign', async () => {
      const { vault, terms, dom } = await loadFixture(deploy)
      expect(await vault.termsDigest(terms)).to.equal(ethers.TypedDataEncoder.hash(dom, TYPES, terms))
    })

    it('pulls the full budget and pays deposits first', async () => {
      const { vault, usdc, lead, ada, tobi, terms, sigs } = await loadFixture(deploy)
      await expect(vault.connect(lead).fund(terms, sigs))
        .to.emit(vault, 'Funded')
        .and.to.emit(vault, 'DepositPaid')
        .withArgs(pid, 0, ada.address, usd(140))
      expect(await usdc.balanceOf(ada)).to.equal(usd(140))
      expect(await usdc.balanceOf(tobi)).to.equal(usd(180))
      expect(await usdc.balanceOf(vault)).to.equal(usd(1600 - 320))
      expect(await usdc.balanceOf(lead)).to.equal(usd(10_000 - 1600))
      const p = await vault.projects(pid)
      expect(p.status).to.equal(P.Active)
      expect(await vault.held(pid)).to.equal(usd(1280))
    })

    it('rejects terms someone did not sign', async () => {
      const { vault, lead, terms, sign, ada, tobi } = await loadFixture(deploy)
      const raised = structuredClone(terms)
      raised.roles[0].milestones[0].amount = usd(1)
      // Ada signed the original; the Lead tries to fund a cheaper version.
      await expect(vault.connect(lead).fund(raised, [await sign(ada), await sign(tobi, raised)]))
        .to.be.revertedWithCustomError(vault, 'BadSignature')
        .withArgs(0)
    })

    it('rejects a signature from the wrong person', async () => {
      const { vault, lead, terms, sign, ada, stranger } = await loadFixture(deploy)
      await expect(vault.connect(lead).fund(terms, [await sign(ada), await sign(stranger)]))
        .to.be.revertedWithCustomError(vault, 'BadSignature')
        .withArgs(1)
    })

    it('rejects an older draft version', async () => {
      const { vault, lead, terms, sigs } = await loadFixture(deploy)
      await expect(vault.connect(lead).fund({ ...terms, version: 2 }, sigs)).to.be.revertedWithCustomError(vault, 'BadSignature')
    })

    it('accepts signatures from smart wallets (ERC-1271)', async () => {
      const { vault, lead, terms, sign, tobi, ada } = await loadFixture(deploy)
      const wallet = await (await ethers.getContractFactory('MockSmartWallet')).deploy(ada.address)
      const t = structuredClone(terms)
      t.roles[0].collaborator = await wallet.getAddress()
      // The wallet's owner key signs the terms; the wallet vouches for that signature on-chain.
      const walletSig = await sign(ada, t)
      await expect(vault.connect(lead).fund(t, [walletSig, await sign(tobi, t)])).to.emit(vault, 'Funded')
    })

    it('only the Lead can fund, and only once', async () => {
      const { vault, lead, stranger, terms, sigs } = await loadFixture(deploy)
      await expect(vault.connect(stranger).fund(terms, sigs)).to.be.revertedWithCustomError(vault, 'NotLead')
      await vault.connect(lead).fund(terms, sigs)
      await expect(vault.connect(lead).fund(terms, sigs)).to.be.revertedWithCustomError(vault, 'ProjectExists')
    })
  })

  describe('agreeing on-chain (passkey accounts)', () => {
    it('funds when collaborators agreed on-chain instead of signing', async () => {
      const { vault, lead, ada, tobi, terms } = await loadFixture(deploy)
      const digest = await vault.termsDigest(terms)
      await expect(vault.connect(ada).agree(digest)).to.emit(vault, 'Agreed').withArgs(digest, ada.address)
      await vault.connect(tobi).agree(digest)
      await expect(vault.connect(lead).fund(terms, ['0x', '0x'])).to.emit(vault, 'Funded')
    })

    it('mixes on-chain agreement and signatures', async () => {
      const { vault, lead, ada, tobi, terms, sign } = await loadFixture(deploy)
      await vault.connect(ada).agree(await vault.termsDigest(terms))
      await expect(vault.connect(lead).fund(terms, ['0x', await sign(tobi)])).to.emit(vault, 'Funded')
    })

    it('an agreement covers only those exact terms', async () => {
      const { vault, lead, ada, tobi, terms } = await loadFixture(deploy)
      await vault.connect(ada).agree(await vault.termsDigest(terms))
      await vault.connect(tobi).agree(await vault.termsDigest(terms))
      const raised = structuredClone(terms)
      raised.roles[0].deposit = usd(500)
      await expect(vault.connect(lead).fund(raised, ['0x', '0x'])).to.be.revertedWithCustomError(vault, 'BadSignature').withArgs(0)
      const v2 = { ...structuredClone(terms), version: 2 }
      await expect(vault.connect(lead).fund(v2, ['0x', '0x'])).to.be.revertedWithCustomError(vault, 'BadSignature').withArgs(0)
    })

    it('someone else agreeing does not count', async () => {
      const { vault, lead, tobi, stranger, terms } = await loadFixture(deploy)
      const digest = await vault.termsDigest(terms)
      await vault.connect(stranger).agree(digest)
      await vault.connect(tobi).agree(digest)
      await expect(vault.connect(lead).fund(terms, ['0x', '0x'])).to.be.revertedWithCustomError(vault, 'BadSignature').withArgs(0)
    })
  })

  describe('Tempo transfer memos', () => {
    it('tags every payout with the project id', async () => {
      const [owner, lead, ada, tobi, reviewer] = await ethers.getSigners()
      const coin = await (await ethers.getContractFactory('MockTIP20')).deploy()
      const vault = await (await ethers.getContractFactory('CrewPayVault')).deploy(coin, true, reviewer, owner)
      await coin.mint(lead, usd(1000))
      await coin.connect(lead).approve(vault, ethers.MaxUint256)
      const terms = {
        projectId: pid,
        lead: lead.address,
        version: 1,
        roles: [
          { collaborator: ada.address, deposit: usd(100), milestones: [{ amount: usd(400), due: 0, revisions: 1, doneWhen: text('Cover art') }] },
          { collaborator: tobi.address, deposit: 0, milestones: [{ amount: usd(500), due: 0, revisions: 1, doneWhen: text('Mix') }] },
        ],
      }
      const digest = await vault.termsDigest(terms)
      await vault.connect(ada).agree(digest)
      await vault.connect(tobi).agree(digest)
      await expect(vault.connect(lead).fund(terms, ['0x', '0x']))
        .to.emit(coin, 'TransferWithMemo')
        .withArgs(await vault.getAddress(), ada.address, usd(100), pid)
      await vault.connect(ada).submit(pid, 0, 0, text('art'))
      await expect(vault.connect(lead).approve(pid, 0, 0))
        .to.emit(coin, 'TransferWithMemo')
        .withArgs(await vault.getAddress(), ada.address, usd(400), pid)
      expect(await coin.balanceOf(ada)).to.equal(usd(500))
    })
  })

  describe('milestones', () => {
    it('pays the collaborator when the Lead approves', async () => {
      const { vault, usdc, lead, ada } = await loadFixture(funded)
      await vault.connect(ada).submit(pid, 0, 0, text('figma link'))
      await expect(vault.connect(lead).approve(pid, 0, 0))
        .to.emit(vault, 'MilestonePaid')
        .withArgs(pid, 0, 0, ada.address, usd(280), false)
      expect(await usdc.balanceOf(ada)).to.equal(usd(140 + 280))
      expect((await vault.milestone(pid, 0, 0)).status).to.equal(S.Paid)
    })

    it('only the collaborator submits and only the Lead reviews', async () => {
      const { vault, ada, tobi } = await loadFixture(funded)
      await expect(vault.connect(tobi).submit(pid, 0, 0, text('x'))).to.be.revertedWithCustomError(vault, 'NotCollaborator')
      await vault.connect(ada).submit(pid, 0, 0, text('x'))
      await expect(vault.connect(ada).approve(pid, 0, 0)).to.be.revertedWithCustomError(vault, 'NotLead')
    })

    it('limits change requests to the agreed rounds', async () => {
      const { vault, lead, tobi } = await loadFixture(funded)
      await vault.connect(tobi).submit(pid, 1, 0, text('v1'))
      await vault.connect(lead).requestChanges(pid, 1, 0, text('score is 61'))
      await vault.connect(tobi).submit(pid, 1, 0, text('v2'))
      await expect(vault.connect(lead).requestChanges(pid, 1, 0, text('still low'))).to.be.revertedWithCustomError(
        vault,
        'NoRevisionsLeft',
      )
    })

    it('auto-releases after 7 days of Lead silence, not before', async () => {
      const { vault, usdc, ada, stranger } = await loadFixture(funded)
      await vault.connect(ada).submit(pid, 0, 0, text('x'))
      await time.increase(7 * DAY - 60)
      await expect(vault.connect(stranger).release(pid, 0, 0)).to.be.revertedWithCustomError(vault, 'TooEarly')
      await time.increase(120)
      await expect(vault.connect(stranger).release(pid, 0, 0))
        .to.emit(vault, 'MilestonePaid')
        .withArgs(pid, 0, 0, ada.address, usd(280), true)
      expect(await usdc.balanceOf(ada)).to.equal(usd(420))
    })

    it('lets the Lead reclaim a missed deadline with nothing submitted', async () => {
      const { vault, usdc, lead, ada } = await loadFixture(funded)
      await time.increase(10 * DAY + 3 * DAY)
      await expect(vault.connect(lead).reclaim(pid, 0, 0)).to.be.revertedWithCustomError(vault, 'TooEarly')
      await time.increase(5 * DAY)
      const before = await usdc.balanceOf(lead)
      await vault.connect(lead).reclaim(pid, 0, 0)
      expect(await usdc.balanceOf(lead)).to.equal(before + usd(280))
      // Once something was submitted, the Lead can't reclaim it.
      await vault.connect(ada).submit(pid, 0, 1, text('x'))
      await vault.connect(lead).requestChanges(pid, 0, 1, text('fix'))
      await time.increase(30 * DAY)
      await expect(vault.connect(lead).reclaim(pid, 0, 1)).to.be.revertedWithCustomError(vault, 'CannotReclaim')
    })
  })

  describe('disputes', () => {
    it('Lead can dispute once rounds are used; reviewer splits the money', async () => {
      const { vault, usdc, lead, tobi, reviewer } = await loadFixture(funded)
      await vault.connect(tobi).submit(pid, 1, 0, text('v1'))
      await expect(vault.connect(lead).openDispute(pid, 1, 0)).to.be.revertedWithCustomError(vault, 'CannotDispute')
      await vault.connect(lead).requestChanges(pid, 1, 0, text('61'))
      await vault.connect(tobi).submit(pid, 1, 0, text('v2'))
      await vault.connect(lead).openDispute(pid, 1, 0)
      // Disputed money can't auto-release.
      await time.increase(8 * DAY)
      await expect(vault.release(pid, 1, 0)).to.be.revertedWithCustomError(vault, 'WrongStatus')
      await expect(vault.connect(lead).rule(pid, 1, 0, 7000)).to.be.revertedWithCustomError(vault, 'NotReviewer')
      const leadBefore = await usdc.balanceOf(lead)
      await expect(vault.connect(reviewer).rule(pid, 1, 0, 7000))
        .to.emit(vault, 'DisputeRuled')
        .withArgs(pid, 1, 0, 7000, usd(504), usd(216))
      expect(await usdc.balanceOf(tobi)).to.equal(usd(180 + 504))
      expect(await usdc.balanceOf(lead)).to.equal(leadBefore + usd(216))
    })

    it('collaborator can dispute after the last change request', async () => {
      const { vault, lead, tobi } = await loadFixture(funded)
      await vault.connect(tobi).submit(pid, 1, 0, text('v1'))
      await vault.connect(lead).requestChanges(pid, 1, 0, text('61'))
      await expect(vault.connect(tobi).openDispute(pid, 1, 0)).to.emit(vault, 'DisputeOpened').withArgs(pid, 1, 0, tobi.address)
    })
  })

  describe('cancel', () => {
    it('needs everyone; paid work stays paid, the rest returns to the Lead', async () => {
      const { vault, usdc, lead, ada, tobi, stranger } = await loadFixture(funded)
      await vault.connect(ada).submit(pid, 0, 0, text('x'))
      await vault.connect(lead).approve(pid, 0, 0) // $280 paid to Ada
      await expect(vault.connect(stranger).proposeCancel(pid)).to.be.revertedWithCustomError(vault, 'NotParty')
      await vault.connect(ada).proposeCancel(pid)
      await vault.connect(tobi).approveCancel(pid)
      expect((await vault.projects(pid)).status).to.equal(P.Active)
      const leadBefore = await usdc.balanceOf(lead)
      await expect(vault.connect(lead).approveCancel(pid)).to.emit(vault, 'ProjectCancelled').withArgs(pid, usd(1000))
      expect(await usdc.balanceOf(lead)).to.equal(leadBefore + usd(1000))
      expect(await usdc.balanceOf(vault)).to.equal(0)
      expect(await usdc.balanceOf(ada)).to.equal(usd(420))
      await expect(vault.connect(tobi).submit(pid, 1, 0, text('x'))).to.be.revertedWithCustomError(vault, 'NotActive')
    })

    it('any party can refuse, and work continues', async () => {
      const { vault, lead, ada, tobi } = await loadFixture(funded)
      await vault.connect(lead).proposeCancel(pid)
      await vault.connect(ada).approveCancel(pid)
      await vault.connect(tobi).withdrawCancel(pid)
      await expect(vault.connect(ada).approveCancel(pid)).to.be.revertedWithCustomError(vault, 'NoCancelRequest')
      await vault.connect(tobi).submit(pid, 1, 0, text('x'))
    })
  })

  it('pays out every cent exactly once and completes', async () => {
    const { vault, usdc, lead, ada, tobi, reviewer } = await loadFixture(funded)
    await vault.connect(ada).submit(pid, 0, 0, text('a'))
    await vault.connect(lead).approve(pid, 0, 0)
    await vault.connect(ada).submit(pid, 0, 1, text('b'))
    await time.increase(7 * DAY)
    await vault.release(pid, 0, 1)
    await vault.connect(tobi).submit(pid, 1, 0, text('c'))
    await vault.connect(lead).requestChanges(pid, 1, 0, text('d'))
    await vault.connect(tobi).openDispute(pid, 1, 0)
    await expect(vault.connect(reviewer).rule(pid, 1, 0, 3333)).to.emit(vault, 'ProjectCompleted').withArgs(pid)
    expect(await usdc.balanceOf(vault)).to.equal(0)
    expect(await vault.held(pid)).to.equal(0)
    expect((await vault.projects(pid)).status).to.equal(P.Done)
  })
})
