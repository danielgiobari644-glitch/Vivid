"""Authentication routes using Firebase Admin SDK."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from firebase_admin import auth, firestore
from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_db() -> firestore.firestore.Client:
    """Get Firestore client."""
    from ..main import db
    return db


async def verify_token(authorization: Optional[str] = Header(None)) -> dict:
    """Verify Firebase ID token from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    token = authorization.replace("Bearer ", "")
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")


@router.post("/register")
async def register(request: Request):
    """Create a new user account."""
    try:
        body = await request.json()
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        display_name = body.get("display_name", "").strip()

        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Valid email is required")
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name is required")

        try:
            user_record = auth.create_user(
                email=email,
                password=password,
                display_name=display_name,
            )
        except auth.EmailAlreadyExistsError:
            raise HTTPException(status_code=409, detail="Email already registered")
        except auth.PasswordStrengthError:
            raise HTTPException(status_code=400, detail="Password is too weak")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to create user: {str(e)}")

        db = get_db()
        now = __import__("datetime").datetime.utcnow().isoformat()
        db.collection("users").document(user_record.uid).set({
            "uid": user_record.uid,
            "email": user_record.email,
            "displayName": display_name,
            "photoUrl": user_record.photo_url or "",
            "createdAt": now,
            "updatedAt": now,
        })

        custom_token = auth.create_custom_token(user_record.uid)
        if isinstance(custom_token, bytes):
            custom_token = custom_token.decode("utf-8")

        return {
            "uid": user_record.uid,
            "email": user_record.email,
            "display_name": user_record.display_name,
            "photo_url": user_record.photo_url,
            "token": custom_token,
            "created_at": now,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login")
async def login(request: Request):
    """Verify user credentials and return user data with token."""
    try:
        body = await request.json()
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password are required")

        try:
            from google.cloud import firestore_v1
        except ImportError:
            pass

        user = None
        try:
            user = auth.get_user_by_email(email)
        except auth.UserNotFoundError:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        custom_token = auth.create_custom_token(user.uid)
        if isinstance(custom_token, bytes):
            custom_token = custom_token.decode("utf-8")

        db = get_db()
        user_doc = db.collection("users").document(user.uid).get()
        user_data = user_doc.to_dict() if user_doc.exists else None

        return {
            "uid": user.uid,
            "email": user.email,
            "display_name": user.display_name or (user_data.get("displayName") if user_data else email.split("@")[0]),
            "photo_url": user.photo_url or (user_data.get("photoUrl") if user_data else None),
            "token": custom_token,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/google")
async def google_auth(request: Request):
    """Authenticate with Google ID token."""
    try:
        body = await request.json()
        id_token = body.get("id_token", "")

        if not id_token:
            raise HTTPException(status_code=400, detail="Google ID token is required")

        try:
            decoded = auth.verify_id_token(id_token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid Google ID token")

        uid = decoded.get("uid")
        email = decoded.get("email", "")
        name = decoded.get("name", "")
        picture = decoded.get("picture", "")

        db = get_db()
        now = __import__("datetime").datetime.utcnow().isoformat()
        user_ref = db.collection("users").document(uid)

        if not user_ref.get().exists:
            user_ref.set({
                "uid": uid,
                "email": email,
                "displayName": name,
                "photoUrl": picture,
                "createdAt": now,
                "updatedAt": now,
            })
        else:
            user_ref.update({
                "displayName": name,
                "photoUrl": picture,
                "updatedAt": now,
            })

        custom_token = auth.create_custom_token(uid)
        if isinstance(custom_token, bytes):
            custom_token = custom_token.decode("utf-8")

        return {
            "uid": uid,
            "email": email,
            "display_name": name,
            "photo_url": picture,
            "token": custom_token,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-password")
async def reset_password(request: Request):
    """Send password reset email."""
    try:
        body = await request.json()
        email = body.get("email", "").strip().lower()

        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        link = auth.generate_password_reset_link(email)

        return {
            "message": "Password reset link generated",
            "reset_link": link,
        }

    except auth.UserNotFoundError:
        raise HTTPException(status_code=404, detail="No user found with this email")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me")
async def get_me(user_data: dict = Depends(verify_token)):
    """Get current user profile."""
    try:
        uid = user_data.get("uid")
        user = auth.get_user(uid)

        db = get_db()
        user_doc = db.collection("users").document(uid).get()
        profile = user_doc.to_dict() if user_doc.exists else {}

        return {
            "uid": user.uid,
            "email": user.email,
            "display_name": user.display_name or profile.get("displayName", ""),
            "photo_url": user.photo_url or profile.get("photoUrl", ""),
            "created_at": profile.get("createdAt"),
            "updated_at": profile.get("updatedAt"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/me")
async def update_me(request: Request, user_data: dict = Depends(verify_token)):
    """Update current user profile."""
    try:
        body = await request.json()
        uid = user_data.get("uid")
        now = __import__("datetime").datetime.utcnow().isoformat()

        update_data = {"updatedAt": now}
        if "display_name" in body and body["display_name"]:
            update_data["displayName"] = body["display_name"]
        if "photo_url" in body and body["photo_url"] is not None:
            update_data["photoUrl"] = body["photo_url"]

        auth.update_user(uid, display_name=body.get("display_name"), photo_url=body.get("photo_url"))

        db = get_db()
        db.collection("users").document(uid).update(update_data)

        user = auth.get_user(uid)
        return {
            "uid": user.uid,
            "email": user.email,
            "display_name": user.display_name,
            "photo_url": user.photo_url,
            "updated_at": now,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout")
async def logout(user_data: dict = Depends(verify_token)):
    """Logout - revoke the user token."""
    try:
        uid = user_data.get("uid")
        auth.revoke_refresh_tokens(uid)

        return {"message": "Successfully logged out"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
