// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Tempo's TIP-20 stablecoins can tag a transfer with a 32-byte memo, like a bank reference.
interface ITIP20Memo {
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;
}

/// @title CrewPay vault
/// @notice Holds a crew's budget in a dollar stablecoin and releases it only by the rules everyone signed:
///         deposits first, then each milestone when the Lead approves it, when the Lead stays
///         silent for 7 days, or as split by the reviewer in a dispute. Nobody, including the
///         contract owner, can move money any other way.
/// @dev One contract holds every project, keyed by projectId. Drafting and negotiation happen
///      off-chain; each collaborator agrees to the final terms either by signing them (EIP-712,
///      EOA or ERC-1271 smart wallet) or by calling agree() with their digest, which works for
///      any account, including passkey accounts. The Lead then funds, in one transaction.
///      On Tempo every payout carries the projectId as its transfer memo.
contract CrewPayVault is EIP712, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- rules

    uint256 public constant REVIEW_PERIOD = 7 days; // Lead silent this long after a submission -> pays out
    uint256 public constant GRACE_PERIOD = 7 days; // past a due date with nothing submitted -> Lead may reclaim
    uint256 public constant MAX_ROLES = 16;
    uint256 public constant MAX_MILESTONES = 16;
    uint256 private constant BPS = 10_000;

    // ---------------------------------------------------------------- signed terms (EIP-712)

    struct MilestoneTerms {
        uint128 amount;
        uint64 due; // unix time the milestone is due (0 = no deadline)
        uint8 revisions; // rounds of changes the Lead may request
        bytes32 doneWhen; // keccak256 of the agreed "Done when" text
    }

    struct RoleTerms {
        address collaborator;
        uint128 deposit; // paid the moment the vault is funded
        MilestoneTerms[] milestones;
    }

    struct Terms {
        bytes32 projectId;
        address lead;
        uint32 version; // the draft version everyone signed
        RoleTerms[] roles;
    }

    bytes32 private constant MILESTONE_TYPEHASH =
        keccak256("Milestone(uint128 amount,uint64 due,uint8 revisions,bytes32 doneWhen)");
    bytes32 private constant ROLE_TYPEHASH = keccak256(
        "Role(address collaborator,uint128 deposit,Milestone[] milestones)"
        "Milestone(uint128 amount,uint64 due,uint8 revisions,bytes32 doneWhen)"
    );
    bytes32 private constant TERMS_TYPEHASH = keccak256(
        "Terms(bytes32 projectId,address lead,uint32 version,Role[] roles)"
        "Milestone(uint128 amount,uint64 due,uint8 revisions,bytes32 doneWhen)"
        "Role(address collaborator,uint128 deposit,Milestone[] milestones)"
    );

    // ---------------------------------------------------------------- state

    enum ProjectStatus {
        None,
        Active,
        Done,
        Cancelled
    }

    enum MilestoneStatus {
        Working,
        Submitted,
        Paid,
        Disputed,
        Resolved,
        Reclaimed
    }

    struct Project {
        address lead;
        uint32 version;
        ProjectStatus status;
        bool cancelRequested;
        uint32 cancelApprovals; // bit 0 = Lead, bit i+1 = role i
        uint128 total;
        uint128 settled; // paid out + returned to the Lead
    }

    struct Role {
        address collaborator;
        uint128 deposit;
    }

    struct Milestone {
        uint128 amount;
        uint64 due;
        uint64 submittedAt;
        uint8 revisions;
        uint8 changesUsed;
        bool everSubmitted;
        MilestoneStatus status;
    }

    IERC20 public immutable token; // the dollar stablecoin: USDC on Base, a TIP-20 stablecoin on Tempo
    bool public immutable memos; // true on Tempo: payouts use transferWithMemo(projectId)
    address public reviewer; // rules on disputes; can only split a disputed milestone's money

    mapping(bytes32 => Project) public projects;
    mapping(bytes32 => Role[]) private _roles;
    mapping(bytes32 => mapping(uint256 => Milestone[])) private _milestones;
    /// @notice Terms each account agreed to on-chain: agreed[account][termsDigest].
    mapping(address => mapping(bytes32 => bool)) public agreed;

    // ---------------------------------------------------------------- events

    event ReviewerChanged(address indexed reviewer);
    event Agreed(bytes32 indexed termsDigest, address indexed by);
    event Funded(bytes32 indexed projectId, address indexed lead, uint32 version, uint256 total, bytes32 termsDigest);
    event DepositPaid(bytes32 indexed projectId, uint256 indexed role, address indexed to, uint256 amount);
    event WorkSubmitted(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, bytes32 workHash);
    event ChangesRequested(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, bytes32 noteHash, uint8 round);
    event MilestonePaid(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, address to, uint256 amount, bool automatic);
    event DisputeOpened(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, address by);
    event DisputeRuled(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, uint256 collaboratorBps, uint256 toCollaborator, uint256 toLead);
    event MilestoneReclaimed(bytes32 indexed projectId, uint256 indexed role, uint256 indexed milestone, uint256 amount);
    event CancelProposed(bytes32 indexed projectId, address indexed by);
    event CancelApproved(bytes32 indexed projectId, address indexed by);
    event CancelWithdrawn(bytes32 indexed projectId, address indexed by);
    event ProjectCancelled(bytes32 indexed projectId, uint256 refunded);
    event ProjectCompleted(bytes32 indexed projectId);

    // ---------------------------------------------------------------- errors

    error ProjectExists();
    error NotActive();
    error NotLead();
    error NotCollaborator();
    error NotReviewer();
    error NotParty();
    error BadTerms();
    error BadSignature(uint256 role);
    error WrongStatus();
    error NoRevisionsLeft();
    error TooEarly();
    error CannotDispute();
    error CannotReclaim();
    error NoCancelRequest();
    error AlreadyApproved();

    constructor(IERC20 token_, bool memos_, address reviewer_, address owner_) EIP712("CrewPay", "1") Ownable(owner_) {
        token = token_;
        memos = memos_;
        reviewer = reviewer_;
        emit ReviewerChanged(reviewer_);
    }

    function setReviewer(address reviewer_) external onlyOwner {
        reviewer = reviewer_;
        emit ReviewerChanged(reviewer_);
    }

    // ---------------------------------------------------------------- views

    function roleCount(bytes32 projectId) external view returns (uint256) {
        return _roles[projectId].length;
    }

    function role(bytes32 projectId, uint256 r) external view returns (Role memory) {
        return _roles[projectId][r];
    }

    function milestone(bytes32 projectId, uint256 r, uint256 m) external view returns (Milestone memory) {
        return _milestones[projectId][r][m];
    }

    /// @notice Money still locked in the vault for this project.
    function held(bytes32 projectId) public view returns (uint256) {
        Project storage p = projects[projectId];
        return p.total - p.settled;
    }

    /// @notice The digest each collaborator signs. Exposed so apps and tests can check their encoding.
    function termsDigest(Terms calldata t) public view returns (bytes32) {
        return _hashTypedDataV4(_hashTerms(t));
    }

    // ---------------------------------------------------------------- funding

    /// @notice Agree to terms on-chain instead of signing them. The digest covers the chain, this
    ///         vault, the project, the draft version and every role's pay, so agreeing to one draft
    ///         says nothing about any other.
    function agree(bytes32 termsDigest_) external {
        agreed[msg.sender][termsDigest_] = true;
        emit Agreed(termsDigest_, msg.sender);
    }

    /// @notice The Lead funds the vault once every collaborator has agreed to the final terms.
    ///         Deposits are paid out in the same transaction.
    /// @param signatures One entry per role, in role order: that collaborator's signature, or
    ///        empty bytes if they agreed on-chain with agree().
    function fund(Terms calldata t, bytes[] calldata signatures) external nonReentrant {
        if (msg.sender != t.lead) revert NotLead();
        Project storage p = projects[t.projectId];
        if (p.status != ProjectStatus.None) revert ProjectExists();
        uint256 n = t.roles.length;
        if (n == 0 || n > MAX_ROLES || signatures.length != n) revert BadTerms();

        bytes32 digest = termsDigest(t);
        uint256 total;
        for (uint256 r; r < n; ++r) {
            RoleTerms calldata rt = t.roles[r];
            uint256 ms = rt.milestones.length;
            if (rt.collaborator == address(0) || ms > MAX_MILESTONES || (ms == 0 && rt.deposit == 0)) revert BadTerms();
            if (!agreed[rt.collaborator][digest] && !SignatureChecker.isValidSignatureNow(rt.collaborator, digest, signatures[r])) {
                revert BadSignature(r);
            }

            _roles[t.projectId].push(Role({collaborator: rt.collaborator, deposit: rt.deposit}));
            total += rt.deposit;
            for (uint256 m; m < ms; ++m) {
                MilestoneTerms calldata mt = rt.milestones[m];
                if (mt.amount == 0) revert BadTerms();
                _milestones[t.projectId][r].push(
                    Milestone({
                        amount: mt.amount,
                        due: mt.due,
                        submittedAt: 0,
                        revisions: mt.revisions,
                        changesUsed: 0,
                        everSubmitted: false,
                        status: MilestoneStatus.Working
                    })
                );
                total += mt.amount;
            }
        }

        p.lead = t.lead;
        p.version = t.version;
        p.status = ProjectStatus.Active;
        p.total = uint128(total);

        token.safeTransferFrom(msg.sender, address(this), total);
        emit Funded(t.projectId, t.lead, t.version, total, digest);

        for (uint256 r; r < n; ++r) {
            uint128 dep = t.roles[r].deposit;
            if (dep > 0) {
                _payOut(t.projectId, t.roles[r].collaborator, dep);
                emit DepositPaid(t.projectId, r, t.roles[r].collaborator, dep);
            }
        }
        _maybeComplete(t.projectId);
    }

    // ---------------------------------------------------------------- milestones

    function submit(bytes32 projectId, uint256 r, uint256 m, bytes32 workHash) external {
        _active(projectId);
        if (msg.sender != _roles[projectId][r].collaborator) revert NotCollaborator();
        Milestone storage ms = _milestones[projectId][r][m];
        if (ms.status != MilestoneStatus.Working) revert WrongStatus();
        ms.status = MilestoneStatus.Submitted;
        ms.submittedAt = uint64(block.timestamp);
        ms.everSubmitted = true;
        emit WorkSubmitted(projectId, r, m, workHash);
    }

    function approve(bytes32 projectId, uint256 r, uint256 m) external nonReentrant {
        _onlyLead(projectId);
        Milestone storage ms = _milestones[projectId][r][m];
        if (ms.status != MilestoneStatus.Submitted) revert WrongStatus();
        _pay(projectId, r, m, ms, false);
    }

    function requestChanges(bytes32 projectId, uint256 r, uint256 m, bytes32 noteHash) external {
        _onlyLead(projectId);
        Milestone storage ms = _milestones[projectId][r][m];
        if (ms.status != MilestoneStatus.Submitted) revert WrongStatus();
        if (ms.changesUsed >= ms.revisions) revert NoRevisionsLeft();
        ms.changesUsed += 1;
        ms.status = MilestoneStatus.Working;
        emit ChangesRequested(projectId, r, m, noteHash, ms.changesUsed);
    }

    /// @notice Anyone can release a submission the Lead left unanswered for REVIEW_PERIOD.
    function release(bytes32 projectId, uint256 r, uint256 m) external nonReentrant {
        _active(projectId);
        Milestone storage ms = _milestones[projectId][r][m];
        if (ms.status != MilestoneStatus.Submitted) revert WrongStatus();
        if (block.timestamp < uint256(ms.submittedAt) + REVIEW_PERIOD) revert TooEarly();
        _pay(projectId, r, m, ms, true);
    }

    /// @notice Once every revision round is used, the Lead (instead of approving) or the
    ///         collaborator (instead of resubmitting) can hand the milestone to the reviewer.
    function openDispute(bytes32 projectId, uint256 r, uint256 m) external {
        _active(projectId);
        Milestone storage ms = _milestones[projectId][r][m];
        bool roundsUsed = ms.changesUsed >= ms.revisions;
        bool byLead = msg.sender == projects[projectId].lead && ms.status == MilestoneStatus.Submitted && roundsUsed;
        bool byCollaborator = msg.sender == _roles[projectId][r].collaborator && ms.status == MilestoneStatus.Working
            && ms.everSubmitted && roundsUsed;
        if (!byLead && !byCollaborator) revert CannotDispute();
        ms.status = MilestoneStatus.Disputed;
        emit DisputeOpened(projectId, r, m, msg.sender);
    }

    /// @notice The reviewer splits a disputed milestone. The rest goes back to the Lead. Final.
    function rule(bytes32 projectId, uint256 r, uint256 m, uint256 collaboratorBps) external nonReentrant {
        if (msg.sender != reviewer) revert NotReviewer();
        _active(projectId);
        if (collaboratorBps > BPS) revert BadTerms();
        Milestone storage ms = _milestones[projectId][r][m];
        if (ms.status != MilestoneStatus.Disputed) revert WrongStatus();
        ms.status = MilestoneStatus.Resolved;
        uint256 toCollaborator = (uint256(ms.amount) * collaboratorBps) / BPS;
        uint256 toLead = ms.amount - toCollaborator;
        if (toCollaborator > 0) _payOut(projectId, _roles[projectId][r].collaborator, toCollaborator);
        if (toLead > 0) _payOut(projectId, projects[projectId].lead, toLead);
        emit DisputeRuled(projectId, r, m, collaboratorBps, toCollaborator, toLead);
        _maybeComplete(projectId);
    }

    /// @notice A deadline passed by GRACE_PERIOD with nothing ever submitted: the Lead takes it back.
    function reclaim(bytes32 projectId, uint256 r, uint256 m) external nonReentrant {
        _onlyLead(projectId);
        Milestone storage ms = _milestones[projectId][r][m];
        if (ms.status != MilestoneStatus.Working || ms.everSubmitted || ms.due == 0) revert CannotReclaim();
        if (block.timestamp <= uint256(ms.due) + GRACE_PERIOD) revert TooEarly();
        ms.status = MilestoneStatus.Reclaimed;
        _payOut(projectId, projects[projectId].lead, ms.amount);
        emit MilestoneReclaimed(projectId, r, m, ms.amount);
        _maybeComplete(projectId);
    }

    // ---------------------------------------------------------------- cancel (everyone must agree)

    function proposeCancel(bytes32 projectId) external {
        _active(projectId);
        Project storage p = projects[projectId];
        if (p.cancelRequested) revert WrongStatus();
        p.cancelRequested = true;
        p.cancelApprovals = 0;
        emit CancelProposed(projectId, msg.sender);
        _approveCancel(projectId, p);
    }

    function approveCancel(bytes32 projectId) external nonReentrant {
        _active(projectId);
        Project storage p = projects[projectId];
        if (!p.cancelRequested) revert NoCancelRequest();
        _approveCancel(projectId, p);
    }

    /// @notice Any party can withdraw or refuse a pending cancel; work continues.
    function withdrawCancel(bytes32 projectId) external {
        _active(projectId);
        Project storage p = projects[projectId];
        if (!p.cancelRequested) revert NoCancelRequest();
        if (_partyBits(projectId, msg.sender) == 0) revert NotParty();
        p.cancelRequested = false;
        p.cancelApprovals = 0;
        emit CancelWithdrawn(projectId, msg.sender);
    }

    // ---------------------------------------------------------------- internals

    function _approveCancel(bytes32 projectId, Project storage p) private {
        uint32 bits = _partyBits(projectId, msg.sender);
        if (bits == 0) revert NotParty();
        if (p.cancelApprovals & bits == bits) revert AlreadyApproved();
        p.cancelApprovals |= bits;
        emit CancelApproved(projectId, msg.sender);

        uint32 everyone = uint32((1 << (_roles[projectId].length + 1)) - 1);
        if (p.cancelApprovals == everyone) {
            uint256 refund = held(projectId);
            p.status = ProjectStatus.Cancelled;
            p.cancelRequested = false;
            if (refund > 0) {
                p.settled += uint128(refund);
                _send(projectId, p.lead, refund);
            }
            emit ProjectCancelled(projectId, refund);
        }
    }

    /// @dev Bitmask of every seat this address holds (someone can be Lead and a collaborator).
    function _partyBits(bytes32 projectId, address who) private view returns (uint32 bits) {
        if (who == projects[projectId].lead) bits = 1;
        Role[] storage rs = _roles[projectId];
        for (uint256 i; i < rs.length; ++i) {
            if (rs[i].collaborator == who) bits |= uint32(1 << (i + 1));
        }
    }

    function _pay(bytes32 projectId, uint256 r, uint256 m, Milestone storage ms, bool automatic) private {
        ms.status = MilestoneStatus.Paid;
        address to = _roles[projectId][r].collaborator;
        _payOut(projectId, to, ms.amount);
        emit MilestonePaid(projectId, r, m, to, ms.amount, automatic);
        _maybeComplete(projectId);
    }

    function _payOut(bytes32 projectId, address to, uint256 amount) private {
        projects[projectId].settled += uint128(amount);
        _send(projectId, to, amount);
    }

    function _send(bytes32 projectId, address to, uint256 amount) private {
        if (memos) ITIP20Memo(address(token)).transferWithMemo(to, amount, projectId);
        else token.safeTransfer(to, amount);
    }

    function _maybeComplete(bytes32 projectId) private {
        Project storage p = projects[projectId];
        if (p.status == ProjectStatus.Active && p.settled == p.total) {
            p.status = ProjectStatus.Done;
            emit ProjectCompleted(projectId);
        }
    }

    function _active(bytes32 projectId) private view {
        if (projects[projectId].status != ProjectStatus.Active) revert NotActive();
    }

    function _onlyLead(bytes32 projectId) private view {
        _active(projectId);
        if (msg.sender != projects[projectId].lead) revert NotLead();
    }

    function _hashMilestone(MilestoneTerms calldata mt) private pure returns (bytes32) {
        return keccak256(abi.encode(MILESTONE_TYPEHASH, mt.amount, mt.due, mt.revisions, mt.doneWhen));
    }

    function _hashRole(RoleTerms calldata rt) private pure returns (bytes32) {
        bytes32[] memory hs = new bytes32[](rt.milestones.length);
        for (uint256 i; i < hs.length; ++i) hs[i] = _hashMilestone(rt.milestones[i]);
        return keccak256(abi.encode(ROLE_TYPEHASH, rt.collaborator, rt.deposit, keccak256(abi.encodePacked(hs))));
    }

    function _hashTerms(Terms calldata t) private pure returns (bytes32) {
        bytes32[] memory hs = new bytes32[](t.roles.length);
        for (uint256 i; i < hs.length; ++i) hs[i] = _hashRole(t.roles[i]);
        return keccak256(abi.encode(TERMS_TYPEHASH, t.projectId, t.lead, t.version, keccak256(abi.encodePacked(hs))));
    }
}
