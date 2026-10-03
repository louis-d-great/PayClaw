// Generated from contracts/artifacts (CrewPayVault). Regenerate after changing the contract.
export const vaultAbi = [
  {
    "inputs": [],
    "name": "AlreadyApproved",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      }
    ],
    "name": "BadSignature",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadTerms",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotDispute",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotReclaim",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShortString",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoCancelRequest",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoRevisionsLeft",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotActive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotCollaborator",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotLead",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotParty",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotReviewer",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProjectExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "str",
        "type": "string"
      }
    ],
    "name": "StringTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TooEarly",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WrongStatus",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "termsDigest",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "Agreed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "CancelApproved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "CancelProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "CancelWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestone",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "noteHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "round",
        "type": "uint8"
      }
    ],
    "name": "ChangesRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "DepositPaid",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestone",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "by",
        "type": "address"
      }
    ],
    "name": "DisputeOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestone",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "collaboratorBps",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "toCollaborator",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "toLead",
        "type": "uint256"
      }
    ],
    "name": "DisputeRuled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "lead",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "version",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "total",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "termsDigest",
        "type": "bytes32"
      }
    ],
    "name": "Funded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestone",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "automatic",
        "type": "bool"
      }
    ],
    "name": "MilestonePaid",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestone",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "MilestoneReclaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "refunded",
        "type": "uint256"
      }
    ],
    "name": "ProjectCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      }
    ],
    "name": "ProjectCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      }
    ],
    "name": "ReviewerChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "role",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestone",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "workHash",
        "type": "bytes32"
      }
    ],
    "name": "WorkSubmitted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "GRACE_PERIOD",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_MILESTONES",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_ROLES",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "REVIEW_PERIOD",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "acceptOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "termsDigest_",
        "type": "bytes32"
      }
    ],
    "name": "agree",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "agreed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      }
    ],
    "name": "approveCancel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      {
        "internalType": "bytes1",
        "name": "fields",
        "type": "bytes1"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "verifyingContract",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "uint256[]",
        "name": "extensions",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "projectId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "lead",
            "type": "address"
          },
          {
            "internalType": "uint32",
            "name": "version",
            "type": "uint32"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "collaborator",
                "type": "address"
              },
              {
                "internalType": "uint128",
                "name": "deposit",
                "type": "uint128"
              },
              {
                "components": [
                  {
                    "internalType": "uint128",
                    "name": "amount",
                    "type": "uint128"
                  },
                  {
                    "internalType": "uint64",
                    "name": "due",
                    "type": "uint64"
                  },
                  {
                    "internalType": "uint8",
                    "name": "revisions",
                    "type": "uint8"
                  },
                  {
                    "internalType": "bytes32",
                    "name": "doneWhen",
                    "type": "bytes32"
                  }
                ],
                "internalType": "struct CrewPayVault.MilestoneTerms[]",
                "name": "milestones",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct CrewPayVault.RoleTerms[]",
            "name": "roles",
            "type": "tuple[]"
          }
        ],
        "internalType": "struct CrewPayVault.Terms",
        "name": "t",
        "type": "tuple"
      },
      {
        "internalType": "bytes[]",
        "name": "signatures",
        "type": "bytes[]"
      }
    ],
    "name": "fund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      }
    ],
    "name": "held",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "memos",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      }
    ],
    "name": "milestone",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint128",
            "name": "amount",
            "type": "uint128"
          },
          {
            "internalType": "uint64",
            "name": "due",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "submittedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint8",
            "name": "revisions",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "changesUsed",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "everSubmitted",
            "type": "bool"
          },
          {
            "internalType": "enum CrewPayVault.MilestoneStatus",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct CrewPayVault.Milestone",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      }
    ],
    "name": "openDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingOwner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "projects",
    "outputs": [
      {
        "internalType": "address",
        "name": "lead",
        "type": "address"
      },
      {
        "internalType": "uint32",
        "name": "version",
        "type": "uint32"
      },
      {
        "internalType": "enum CrewPayVault.ProjectStatus",
        "name": "status",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "cancelRequested",
        "type": "bool"
      },
      {
        "internalType": "uint32",
        "name": "cancelApprovals",
        "type": "uint32"
      },
      {
        "internalType": "uint128",
        "name": "total",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "settled",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      }
    ],
    "name": "proposeCancel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      }
    ],
    "name": "reclaim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      }
    ],
    "name": "release",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "noteHash",
        "type": "bytes32"
      }
    ],
    "name": "requestChanges",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      }
    ],
    "name": "role",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "collaborator",
            "type": "address"
          },
          {
            "internalType": "uint128",
            "name": "deposit",
            "type": "uint128"
          }
        ],
        "internalType": "struct CrewPayVault.Role",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      }
    ],
    "name": "roleCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "collaboratorBps",
        "type": "uint256"
      }
    ],
    "name": "rule",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "reviewer_",
        "type": "address"
      }
    ],
    "name": "setReviewer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "r",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "m",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "workHash",
        "type": "bytes32"
      }
    ],
    "name": "submit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "projectId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "lead",
            "type": "address"
          },
          {
            "internalType": "uint32",
            "name": "version",
            "type": "uint32"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "collaborator",
                "type": "address"
              },
              {
                "internalType": "uint128",
                "name": "deposit",
                "type": "uint128"
              },
              {
                "components": [
                  {
                    "internalType": "uint128",
                    "name": "amount",
                    "type": "uint128"
                  },
                  {
                    "internalType": "uint64",
                    "name": "due",
                    "type": "uint64"
                  },
                  {
                    "internalType": "uint8",
                    "name": "revisions",
                    "type": "uint8"
                  },
                  {
                    "internalType": "bytes32",
                    "name": "doneWhen",
                    "type": "bytes32"
                  }
                ],
                "internalType": "struct CrewPayVault.MilestoneTerms[]",
                "name": "milestones",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct CrewPayVault.RoleTerms[]",
            "name": "roles",
            "type": "tuple[]"
          }
        ],
        "internalType": "struct CrewPayVault.Terms",
        "name": "t",
        "type": "tuple"
      }
    ],
    "name": "termsDigest",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "token",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "projectId",
        "type": "bytes32"
      }
    ],
    "name": "withdrawCancel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const
