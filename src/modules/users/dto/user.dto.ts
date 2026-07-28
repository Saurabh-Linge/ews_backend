export class CreateUserDto {
  username: string;
  password?: string;
  full_name: string;
  email?: string;
  mobile_number?: string;
  role_id?: string;
  branch_id?: string;
  is_active?: boolean;
}

export class UpdateUserDto {
  username?: string;
  password?: string;
  full_name?: string;
  email?: string;
  mobile_number?: string;
  role_id?: string;
  branch_id?: string;
  is_active?: boolean;
}
