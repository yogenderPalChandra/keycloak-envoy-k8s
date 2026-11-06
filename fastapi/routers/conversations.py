
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from db.db import get_db
from db.models import User, Conversation, Message

router = APIRouter(
    prefix="/api/conversations",
    tags=["Conversations"],
)


def get_current_user(
    x_authenticated_user: str = Header(...),
    db: Session = Depends(get_db),
):
    """
    Identity is injected by Envoy after JWT validation.
    Never accept this identity from the request body.
    """

    user = db.query(User).filter(
        User.id == x_authenticated_user
    ).first()

    if user is None:
        user = User(id=x_authenticated_user)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


@router.post("")
def create_conversation(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = Conversation(
        user_id=user.id,
        title="New chat",
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "created_at": conversation.created_at,
    }


@router.get("")
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )

    return [
        {
            "id": str(conversation.id),
            "title": conversation.title,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
        }
        for conversation in conversations
    ]


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .first()
    )

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "messages": [
            {
                "id": str(message.id),
                "role": message.role,
                "content": message.content,
                "created_at": message.created_at,
            }
            for message in conversation.messages
        ],
    }


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .first()
    )

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    db.delete(conversation)
    db.commit()

    return {"deleted": True}
