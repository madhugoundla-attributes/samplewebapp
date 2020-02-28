__copyright__ = "COPYRIGHT 2013-2019, ALL RIGHTS RESERVED, EVERNYM INC."

import asyncio
import json
import random
import sys

from aiohttp import web
from example.helper import console_input, console_yes_no

from src.handlers import Handlers, AddHandler
from src.protocols.Connecting import Connecting
from src.protocols.IssueCredential import IssueCredential
from src.protocols.PresentProof import PresentProof
from src.protocols.Provision import Provision
from src.protocols.UpdateEndpoint import UpdateEndpoint
from src.protocols.WriteCredentialDefinition import WriteCredentialDefinition
from src.protocols.WriteSchema import WriteSchema
from src.utils.Context import Context
from src.utils import truncate_invite_details, uuid
from verity_sdk.utils.Did import Did, create_new_did
from verity_sdk.utils.Verity import retrieve_verity_public_did
from verity_sdk.utils.Wallet import try_create_wallet
from verity_sdk.wallet import DefaultWalletConfig

context: Context
issuer_did: str
issuer_verkey: str

handlers = Handlers()
routes = web.RouteTableDef()
port = 4000


async def provision_agent() -> str:
    global context
    default_verity_url = "http://localhost:9000"
    verity_url = console_input(f"Verity Application Endpoint [{default_verity_url}]").strip()
    wallet_name = "examplewallet1"
    wallet_key = wallet_name
    wallet_path = None

    if not verity_url:
        verity_url = default_verity_url
    print(f"Using Url: {verity_url}")

    verity_public_did: Did = retrieve_verity_public_did(verity_url)
    wallet_config: DefaultWalletConfig = DefaultWalletConfig(wallet_name, wallet_key, wallet_path)

    # Begin building context configuration
    config_dict = {
        'verityUrl': verity_url,
        'verityPublicDID': verity_public_did.did,
        'verityPublicVerkey': verity_public_did.verkey
        #'verityPairwiseDID': self.verity_pairwise_did,
        #'verityPairwiseVerkey': self.verity_pairwise_verkey,
        #'sdkPairwiseDID': self.sdk_pairwise_did,
        #'sdkPairwiseVerkey': self.sdk_pairwise_verkey,
        #'endpointUrl': self.endpoint_url,
    }

    # Add walletName, walletKey, and walletPath to context
    config_dict = wallet_config.add_to_json(config_dict)

    # Ensure the wallet exists
    await try_create_wallet(config_dict.get("walletName"), config_dict.get("walletKey"))

    # Create Context
    context = await Context.create(json.dumps(config_dict))

    # Create and store sdk pairwise DID/Verkey
    sdk_pairwise_did_verkey: Did = await create_new_did(context.wallet_handle)
    # Add sdk did/verkey to Context
    context.sdk_pairwise_did = sdk_pairwise_did_verkey.did
    context.sdk_pairwise_verkey = sdk_pairwise_did_verkey.verkey

    context = await Provision().provision_sdk(context=context)
    return context.to_json()


async def get_config(file_path) -> str:
    try:
        with open(file_path, 'r') as f:
            if console_yes_no(f"Reuse Verity Context (in {file_path})"):
                return f.read()
    except FileNotFoundError:
        pass
    return ""


async def update_webhook_endpoint():
    global context, port
    webhook_from_ctx: str = context.endpoint_url

    if not webhook_from_ctx:
        # Default to localhost on the default port
        webhook_from_ctx = f"http://localhost:{port}"

    webhook: str = console_input(f"Ngrok endpoint [{webhook_from_ctx}]")

    if not webhook:
        webhook = webhook_from_ctx

    print(f"Using Webhook: {webhook}")
    context.endpoint_url = webhook
    # The SDK lets Verity know what its endpoint is
    await UpdateEndpoint(context).update()


async def setup():
    global context
    config = await get_config("verity-context.json")
    if not config:
        config = await provision_agent()
    else:
        context = await Context.create(config)
    await update_webhook_endpoint()
    print("endpoint updated")


async def create_connection():
    global context
    global handlers
    connecting: Connecting = Connecting(include_public_did=True)

    await connecting.connect(context)

@AddHandler(handlers, Connecting.MSG_FAMILY, Connecting.MSG_FAMILY_VERSION)
async def connecting_handler(msg_name, message):
    if msg_name == Connecting.INVITE_DETAIL:
        print_message(msg_name, message)
        # write QR Code to disk

    elif msg_name == Connecting.




async def example():
    global connection_id
    await setup()
    connection_id = await create_connection()

    @AddHandler(handlers, message_type="did:sov:123456789abcdefghi1234;spec/connecting/0.6/CONN_REQUEST_RESP")
    async def print_invite_details(msg: dict) -> None:
        invite_details = truncate_invite_details(msg['inviteDetail'])
        print('Invite Details: {}'.format(json.dumps(invite_details)))

        # write to file for integration tests
        with open('example/inviteDetails.json', 'w') as outfile:
            outfile.write(invite_details)

    # You can also add handlers like this
    # handlers.add_handler(Connecting.get_status_message_type(), Connecting.AWAITING_RESPONSE_STATUS, print_invite_details)

    @AddHandler(handlers, message_type=Connecting.get_status_message_type(),
                message_status=Connecting.INVITE_ACCEPTED_STATUS)
#    async def send_question(msg: dict) -> None:
#        print("Connection accepted!")
#
#        global connection_id
#        connection_id = msg['content']
#        question = QuestionAnswer(
#            connection_id,
#            "Challenge Question",
#            "Hi Alice, how are you today?",
#            " ",
#            ["Great!", "Not so good."])
#        await question.ask(context)
#
#    @AddHandler(handlers, message_type=QuestionAnswer.get_status_message_type(),
#                message_status=QuestionAnswer.QUESTION_ANSWERED_STATUS)
    async def write_schema_to_ledger(msg: dict) -> None:
        print("Question Answered: {}".format(msg['content']))

        write_schema = WriteSchema("Test Schema", get_random_version(), "name", "degree")
        await write_schema.write(context)

    @AddHandler(handlers, message_type=WriteSchema.get_status_message_type(),
                message_status=WriteSchema.WRITE_SUCCESSFUL_STATUS)
    async def write_cred_def_to_ledger(msg: dict) -> None:
        write_cred_def = WriteCredentialDefinition(name="Test Credential Definition", schema_id=msg['content'],
                                                   tag="latest", revocation_details={'support_revocation': False})
        await write_cred_def.write(context)

    @AddHandler(handlers, message_type=WriteCredentialDefinition.get_status_message_type(),
                message_status=WriteCredentialDefinition.WRITE_SUCCESSFUL_STATUS)
    async def send_credential(msg: dict) -> None:
        global cred_def_id
        global connection_id
        cred_def_id = msg['content']
        issue_credential = IssueCredential(
            connection_id,
            name="Degree",
            cred_def_id=cred_def_id,
            credential_values={'name': 'John', 'degree': 'Bachelors of Science'},
            price=0)
        await issue_credential.issue(context)

    @AddHandler(handlers, message_type=IssueCredential.get_status_message_type(),
                message_status=IssueCredential.OFFER_ACCEPTED_BY_USER_STATUS)
    async def print_credential_status(msg: dict) -> None:
        print("User has accepted the credential offer. Verity is now sending the Credential")

    @AddHandler(handlers, message_type=IssueCredential.get_status_message_type(),
                message_status=IssueCredential.CREDENTIAL_SENT_TO_USER_STATUS)
    async def send_proof_request(msg: dict) -> None:
        global cred_def_id
        global connection_id
        present_proof = PresentProof(connection_id, name="Who are you?", proof_attrs=get_proof_attrs(cred_def_id))
        await present_proof.request(context)

    @AddHandler(handlers, message_type=PresentProof.get_status_message_type(),
                message_status=PresentProof.PROOF_RECEIVED_STATUS)
    async def print_proof(msg: dict) -> None:
        print("Proof Accepted")
        print(json.dumps(msg))
        sys.exit(0)

    async def default_handler(msg: dict):
        print("New message from verity: {}".format(json.dumps(msg)))

    handlers.add_default_handler(default_handler)

    async def problem_report_handler(msg: dict) -> None:
        print("New problem report from verity: {}".format(json.dumps(msg)))

    handlers.add_problem_report_handler(problem_report_handler)

def get_random_version():
    return '{}.{}.{}'.format(get_random_int(), get_random_int(), get_random_int())


def get_random_int():
    random.seed()
    return random.randrange(0, 1000)


def get_proof_attrs(cred_def_id: str):
    return [
        {'name': 'name', 'restrictions': [{'issuer_did': get_issuer_did(cred_def_id)}]}
    ]


def get_issuer_did(cred_def_id: str):
    return cred_def_id.split(':')[0]



@routes.post('/')
async def endpoint_handler(request):
    try:
        await handlers.handle_message(context, await request.read())
        return web.Response(text="Success")
    except Exception as e:
        return web.Response(text=str(e))


async def main(loop):
    global port
    app = web.Application(loop=loop)
    app.add_routes(routes)
    await loop.create_server(app.make_handler(), '0.0.0.0', port)
    print("Listening on port {}".format(port))
    await loop.create_task(example())


if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main(loop))
    loop.run_forever()
