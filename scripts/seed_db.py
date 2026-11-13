import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import RoleEnum, User
from app.repositories.user_repository import UserRepository


async def seed() -> None:
    print("Seeding database...")
    async with AsyncSessionLocal() as session:
        repo = UserRepository(session)

        # 1. Admin user
        admin = await repo.get_by_email("admin@hackvally.com")
        if not admin:
            admin = User(
                email="admin@hackvally.com",
                username="admin",
                hashed_password=hash_password("AdminPassword123!"),
                full_name="System Administrator",
                role=RoleEnum.ADMIN.value,
                is_active=True,
                is_verified=True,
            )
            session.add(admin)
            print("Created admin user: admin@hackvally.com")
        else:
            print("Admin user already exists.")

        # 2. Regular user
        test_user = await repo.get_by_email("user@hackvally.com")
        if not test_user:
            test_user = User(
                email="user@hackvally.com",
                username="testuser",
                hashed_password=hash_password("UserPassword123!"),
                full_name="Standard Test User",
                role=RoleEnum.USER.value,
                is_active=True,
                is_verified=True,
            )
            session.add(test_user)
            print("Created test user: user@hackvally.com")
        else:
            print("Test user already exists.")

        await session.commit()
    print("Database seeding completed.")


if __name__ == "__main__":
    asyncio.run(seed())
